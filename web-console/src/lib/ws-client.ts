// WebSocket 客户端类
// 封装：连接管理（带 JWT）、req/res 配对（Promise + id 映射 + 超时）、
// seq gap 检测（触发 onGap 回调）、自动重连（指数退避）、hello-ok 等待

import type {
  WsReqFrame,
  WsServerFrame,
  WsResFrame,
  WsEventFrame,
  WsConnectionStatus,
} from '../types/chat';

export interface WsClientOptions {
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

export class WsClient {
  private ws: WebSocket | null = null;
  private reqId = 0;
  private pending = new Map<string, PendingRequest>();
  private lastSeq = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;
  private status: WsConnectionStatus = 'disconnected';

  constructor(private options: WsClientOptions) {}

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
    } else if (frame.type === 'error') {
      // 服务端错误帧（如 AUTH_TOKEN_INVALID），触发状态变更
      const errMsg = (frame as { error?: string }).error || 'Server error';
      console.error('[ws] server error frame:', errMsg);
      this.setStatus('error');
    }
  }

  private handleResponse(frame: WsResFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;

    if (frame.ok) {
      pending.resolve(frame.payload);
    } else {
      const payload = frame.payload as { error?: string; message?: string } | undefined;
      const errMsg = payload?.message || payload?.error || 'Request failed';
      pending.reject(new Error(errMsg));
    }
  }

  private handleEvent(frame: WsEventFrame): void {
    // hello-ok 事件：标记已连接（不带 seq）
    if (frame.event === 'hello-ok') {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      this.options.onEvent?.('hello-ok', frame.payload, frame.seq);
      return;
    }

    // seq gap 检测（仅对带 seq 的事件）
    if (frame.seq !== undefined) {
      const expected = this.lastSeq + 1;
      if (frame.seq > expected) {
        // 检测到 gap，触发回调
        this.options.onGap?.(expected, frame.seq);
      }
      this.lastSeq = frame.seq;
    }

    this.options.onEvent?.(frame.event, frame.payload, frame.seq);
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
