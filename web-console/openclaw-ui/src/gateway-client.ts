// WebSocket 客户端（魔改自 OpenClaw gateway.ts）
// 保留：连接/重连退避、req/res Promise 映射、seq gap 检测、hello-ok 等待
// 移除：设备身份/ed25519/配对/挑战/operator role
// 认证改为：URL query ?token=<JWT>，对接 ai-gateway src/auth.ts

import type {
  WsReqFrame,
  WsServerFrame,
  WsResFrame,
  WsEventFrame,
  WsConnectionStatus,
} from './types';

export interface GatewayClientOptions {
  url: string;
  token: string;
  onStatusChange?: (status: WsConnectionStatus) => void;
  onEvent?: (event: string, payload: unknown, seq?: number) => void;
  onGap?: (expectedSeq: number, receivedSeq: number) => void;
  reconnectMaxAttempts?: number;
  requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type EventListener = (payload: unknown, seq?: number) => void;

/**
 * GatewayClient — CloudOps WebSocket 客户端
 *
 * 魔改自 OpenClaw GatewayBrowserClient，保留核心健壮性机制：
 * - 指数退避自动重连
 * - req/res Promise 配对 + 超时
 * - per-connection seq gap 检测
 * - hello-ok 等待
 *
 * 认证简化为 JWT query 参数，移除 OpenClaw 的设备配对 + ed25519 签名。
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private reqId = 0;
  private pending = new Map<string, PendingRequest>();
  private lastSeq = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;
  private status: WsConnectionStatus = 'disconnected';
  private eventListeners = new Map<string, Set<EventListener>>();

  constructor(private options: GatewayClientOptions) {}

  get connectionStatus(): WsConnectionStatus {
    return this.status;
  }

  /** 连接 WebSocket */
  connect(): void {
    this.isManualClose = false;
    this.setStatus('connecting');
    const url = `${this.options.url}?token=${encodeURIComponent(this.options.token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      // 等待 hello-ok 事件，不立即标记 connected
    };

    this.ws.onmessage = (e: MessageEvent) => {
      this.handleMessage(e.data);
    };

    this.ws.onerror = () => {
      this.setStatus('error');
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.handleClose(event.code, event.reason);
    };
  }

  /** 手动关闭 */
  close(): void {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'client closed');
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /** 发送 RPC 请求 */
  request<T = unknown>(method: string, params: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }

    const id = `req-${++this.reqId}`;
    const frame: WsReqFrame = { type: 'req', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs ?? 15000;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (payload) => {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve(payload as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        },
        timer,
      });

      this.ws!.send(JSON.stringify(frame));
    });
  }

  /** 注册事件监听器 */
  addEventListener(event: string, listener: EventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /** 移除事件监听器 */
  removeEventListener(event: string, listener: EventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private handleMessage(data: unknown): void {
    let frame: WsServerFrame;
    try {
      frame = JSON.parse(data as string) as WsServerFrame;
    } catch {
      return;
    }

    if (frame.type === 'res') {
      this.handleResponse(frame);
    } else if (frame.type === 'event') {
      this.handleEvent(frame);
    }
  }

  private handleResponse(frame: WsResFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;

    if (frame.ok) {
      pending.resolve(frame.payload);
    } else {
      const errMsg = (frame.payload as { error?: string })?.error || 'Request failed';
      pending.reject(new Error(errMsg));
    }
  }

  private handleEvent(frame: WsEventFrame): void {
    // hello-ok 事件：标记已连接（不带 seq）
    if (frame.event === 'hello-ok') {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      this.options.onEvent?.('hello-ok', frame.payload, frame.seq);
      this.notifyListeners('hello-ok', frame.payload, frame.seq);
      return;
    }

    // seq gap 检测（仅对带 seq 的事件）
    if (frame.seq !== undefined) {
      const expected = this.lastSeq + 1;
      if (frame.seq > expected) {
        this.options.onGap?.(expected, frame.seq);
      }
      this.lastSeq = frame.seq;
    }

    this.options.onEvent?.(frame.event, frame.payload, frame.seq);
    this.notifyListeners(frame.event, frame.payload, frame.seq);
  }

  private notifyListeners(event: string, payload: unknown, seq?: number): void {
    this.eventListeners.get(event)?.forEach((listener) => {
      try {
        listener(payload, seq);
      } catch (err) {
        console.error('Event listener error:', err);
      }
    });
  }

  private handleClose(code: number, _reason: string): void {
    this.ws = null;
    // 拒绝所有 pending 请求
    for (const pending of this.pending.values()) {
      pending.reject(new Error(`Connection closed: ${code}`));
    }
    this.pending.clear();
    this.lastSeq = 0;

    if (this.isManualClose) {
      this.setStatus('disconnected');
      return;
    }

    // 自动重连
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.options.reconnectMaxAttempts ?? 5;
    if (this.reconnectAttempts >= maxAttempts) {
      this.setStatus('error');
      return;
    }

    this.reconnectAttempts++;
    this.setStatus('reconnecting');

    // 指数退避：1s, 2s, 4s, 8s, 16s
    const delay = Math.pow(2, this.reconnectAttempts - 1) * 1000;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private setStatus(status: WsConnectionStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
