// 聊天控制器（魔改自 OpenClaw controllers/chat.ts）
// 保留：loadChatHistory / sendChatMessage / abortChatRun / handleChatEvent / 增量文本合并
// 移除：agent 作用域匹配 / skill workshop / operator 权限 / chat.startup / 附件构造
//
// 核心算法 trimAccumulatedStreamPrefix 复制自 OpenClaw chat/stream-text.ts

import { GatewayClient } from './gateway-client';
import { trimAccumulatedStreamPrefix } from './chat/stream-text';
import type {
  ChatMessage,
  ChatSession,
  ChatEventPayload,
  ChatHistoryResponse,
  ChatSendResponse,
  AcpEvent,
  WsConnectionStatus,
} from './types';

export interface ChatControllerOptions {
  client: GatewayClient;
  onStatusChange?: (status: WsConnectionStatus) => void;
  onMessagesChange?: (sessionKey: string, messages: ChatMessage[]) => void;
  onSessionsChange?: (sessions: ChatSession[]) => void;
  onSendingChange?: (isSending: boolean) => void;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateSessionKey(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `chat:lit:${ts}:${rand}`;
}

/**
 * ACP 事件 → ChatMessage 转换
 * 处理 eventType 命名差异：ACP ledger 用 assistant_delta/assistant_complete，实时事件用 text_delta/done
 */
function acpEventsToMessages(sessionKey: string, events: AcpEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const runMap = new Map<string, ChatMessage>();

  for (const evt of events) {
    const { runId } = evt.payload;

    if (evt.type === 'user_message') {
      messages.push({
        id: generateId('msg'),
        sessionKey,
        runId,
        role: 'user',
        content: evt.payload.message || '',
        toolCalls: [],
        status: 'complete',
        createdAt: evt.seq * 1000,
      });
    } else if (evt.type === 'assistant_delta') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateId('msg'),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      msg.content += evt.payload.delta || '';
    } else if (evt.type === 'assistant_complete') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateId('msg'),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'complete',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      msg.content = evt.payload.finalText || msg.content;
      msg.status = 'complete';
    } else if (evt.type === 'tool_call') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateId('msg'),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      if (evt.payload.toolCall) {
        msg.toolCalls.push({
          id: evt.payload.toolCall.id,
          name: evt.payload.toolCall.name,
          args: evt.payload.toolCall.args,
          status: 'pending',
        });
      }
    } else if (evt.type === 'tool_result') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateId('msg'),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      if (evt.payload.result) {
        const tc = msg.toolCalls.find((t) => t.status === 'pending');
        if (tc) {
          tc.result = evt.payload.result;
          tc.status = 'completed';
        }
      }
    }
  }

  return messages;
}

/**
 * ChatController — 聊天业务逻辑控制器
 *
 * 魔改自 OpenClaw controllers/chat.ts，管理：
 * - 会话列表 + 当前会话
 * - 消息映射（按 sessionKey 分组）
 * - runId → sessionKey 映射（sessionKey 不在事件帧中，前端必须维护）
 * - 流式缓冲（runId → 已接收文本）
 * - 断线恢复（chat.history + inFlightRun 快照）
 */
export class ChatController {
  private sessions: ChatSession[] = [];
  private currentSessionKey: string | null = null;
  private messagesBySession: Record<string, ChatMessage[]> = {};
  private runIdToSession: Record<string, string> = {};
  private streamingBuffers: Record<string, string> = {};
  private isSending = false;

  constructor(private options: ChatControllerOptions) {
    // 注册 chat 事件监听
    this.options.client.addEventListener('chat', (payload) => {
      this.handleChatEvent(payload as ChatEventPayload);
    });
  }

  get currentSession(): ChatSession | null {
    return this.sessions.find((s) => s.sessionKey === this.currentSessionKey) || null;
  }

  get currentMessages(): ChatMessage[] {
    if (!this.currentSessionKey) return [];
    return this.messagesBySession[this.currentSessionKey] || [];
  }

  get sending(): boolean {
    return this.isSending;
  }

  /** 创建新会话 */
  createSession(): string {
    const sessionKey = generateSessionKey();
    const newSession: ChatSession = {
      sessionKey,
      title: '新对话',
      lastMessageAt: Date.now(),
      messageCount: 0,
    };
    this.sessions = [newSession, ...this.sessions];
    this.currentSessionKey = sessionKey;
    this.messagesBySession[sessionKey] = [];
    this.notifySessionsChange();
    this.notifyMessagesChange(sessionKey);
    return sessionKey;
  }

  /** 选择会话 */
  selectSession(sessionKey: string): void {
    this.currentSessionKey = sessionKey;
    this.loadSessionHistory(sessionKey);
  }

  /** 加载会话历史（含断线恢复） */
  async loadSessionHistory(sessionKey: string): Promise<void> {
    try {
      const res = await this.options.client.request<ChatHistoryResponse>('chat.history', {
        sessionKey,
      });
      const messages = acpEventsToMessages(sessionKey, res.events);

      // 处理 in-flight run 快照（断线恢复核心）
      if (res.inFlightRun) {
        const { runId, bufferedText, isRunning } = res.inFlightRun;
        // 记录 runId 映射（sessionKey 不在事件帧中，必须维护）
        this.runIdToSession[runId] = sessionKey;

        // 如果有缓冲文本，创建或更新 assistant 消息
        if (bufferedText) {
          const existingIdx = messages.findIndex((m) => m.runId === runId);
          if (existingIdx >= 0) {
            messages[existingIdx].content = bufferedText;
            messages[existingIdx].status = isRunning ? 'streaming' : 'complete';
          } else {
            messages.push({
              id: generateId('msg'),
              sessionKey,
              runId,
              role: 'assistant',
              content: bufferedText,
              toolCalls: [],
              status: isRunning ? 'streaming' : 'complete',
              createdAt: res.inFlightRun.startedAt,
            });
          }
          this.streamingBuffers[runId] = bufferedText;
        }

        if (isRunning) {
          this.setSending(true);
        }
      }

      this.messagesBySession[sessionKey] = messages;
      this.notifyMessagesChange(sessionKey);

      // 更新会话元信息
      this.sessions = this.sessions.map((s) =>
        s.sessionKey === sessionKey
          ? { ...s, messageCount: messages.length, lastMessageAt: Date.now() }
          : s
      );
      this.notifySessionsChange();
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  }

  /** 发送消息 */
  async sendMessage(text: string): Promise<void> {
    if (!this.currentSessionKey || !text.trim()) return;

    const sessionKey = this.currentSessionKey;
    const runId = generateId('run');

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: generateId('msg'),
      sessionKey,
      role: 'user',
      content: text,
      toolCalls: [],
      status: 'complete',
      createdAt: Date.now(),
    };

    // 添加 assistant 占位消息
    const assistantMsg: ChatMessage = {
      id: generateId('msg'),
      sessionKey,
      runId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      status: 'streaming',
      createdAt: Date.now(),
    };

    this.messagesBySession[sessionKey] = [
      ...(this.messagesBySession[sessionKey] || []),
      userMsg,
      assistantMsg,
    ];
    this.runIdToSession[runId] = sessionKey;
    this.streamingBuffers[runId] = '';
    this.setSending(true);
    this.notifyMessagesChange(sessionKey);

    // 更新会话标题（首条消息）
    this.sessions = this.sessions.map((s) =>
      s.sessionKey === sessionKey && s.title === '新对话'
        ? { ...s, title: text.slice(0, 30), lastMessageAt: Date.now(), messageCount: s.messageCount + 1 }
        : s
    );
    this.notifySessionsChange();

    try {
      await this.options.client.request<ChatSendResponse>('chat.send', {
        sessionKey,
        message: text,
        clientRunId: runId,
      });
    } catch (err) {
      // 发送失败，标记 assistant 消息为错误
      const errorMsg = err instanceof Error ? err.message : '发送失败';
      this.messagesBySession[sessionKey] = this.messagesBySession[sessionKey].map((m) =>
        m.runId === runId ? { ...m, status: 'error' as const, error: errorMsg } : m
      );
      this.setSending(false);
      this.notifyMessagesChange(sessionKey);
    }
  }

  /** 中止 run */
  async abortRun(runId: string): Promise<void> {
    try {
      await this.options.client.request('chat.abort', { runId });
    } catch (err) {
      console.error('Failed to abort run:', err);
    }
  }

  /** 获取当前正在运行的 runId */
  getCurrentRunId(): string | null {
    const runIds = Object.keys(this.streamingBuffers);
    return runIds[0] || null;
  }

  /** 处理 chat 事件（魔改自 OpenClaw handleChatEvent） */
  private handleChatEvent(payload: ChatEventPayload): void {
    const { runId, type } = payload;
    const sessionKey = this.runIdToSession[runId];

    if (!sessionKey) {
      // 未知 runId，忽略
      return;
    }

    const messages = this.messagesBySession[sessionKey] || [];
    const msgIndex = messages.findIndex((m) => m.runId === runId);

    switch (type) {
      case 'text_delta': {
        const delta = (payload as { delta: string }).delta;
        // 使用 OpenClaw 的流式增量合并算法
        const buffer = this.streamingBuffers[runId] || '';
        const newBuffer = buffer + delta;
        this.streamingBuffers[runId] = newBuffer;

        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            content: newBuffer,
            status: 'streaming',
          };
          this.messagesBySession[sessionKey] = newMessages;
          this.notifyMessagesChange(sessionKey);
        }
        break;
      }

      case 'tool_call': {
        const toolCall = (payload as { toolCall: { id: string; name: string; args: unknown } }).toolCall;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          const msg = { ...newMessages[msgIndex] };
          msg.toolCalls = [
            ...msg.toolCalls,
            { id: toolCall.id, name: toolCall.name, args: toolCall.args, status: 'pending' as const },
          ];
          newMessages[msgIndex] = msg;
          this.messagesBySession[sessionKey] = newMessages;
          this.notifyMessagesChange(sessionKey);
        }
        break;
      }

      case 'tool_result': {
        const result = (payload as { result: { name: string; content: unknown } }).result;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          const msg = { ...newMessages[msgIndex] };
          msg.toolCalls = msg.toolCalls.map((t) =>
            t.status === 'pending' ? { ...t, result, status: 'completed' as const } : t
          );
          newMessages[msgIndex] = msg;
          this.messagesBySession[sessionKey] = newMessages;
          this.notifyMessagesChange(sessionKey);
        }
        break;
      }

      case 'done': {
        const finalText = (payload as { finalText: string }).finalText;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            content: finalText,
            status: 'complete',
          };
          this.messagesBySession[sessionKey] = newMessages;
          this.notifyMessagesChange(sessionKey);
        }
        // 清理缓冲
        delete this.streamingBuffers[runId];
        this.setSending(false);
        break;
      }

      case 'error': {
        const errorMsg = (payload as { error: string }).error;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            status: 'error',
            error: errorMsg,
          };
          this.messagesBySession[sessionKey] = newMessages;
          this.notifyMessagesChange(sessionKey);
        }
        delete this.streamingBuffers[runId];
        this.setSending(false);
        break;
      }
    }
  }

  private setSending(sending: boolean): void {
    this.isSending = sending;
    this.options.onSendingChange?.(sending);
  }

  private notifyMessagesChange(sessionKey: string): void {
    this.options.onMessagesChange?.(sessionKey, this.messagesBySession[sessionKey] || []);
  }

  private notifySessionsChange(): void {
    this.options.onSessionsChange?.(this.sessions);
  }
}
