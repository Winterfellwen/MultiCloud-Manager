// AI 对话 Zustand store
// 管理：WsClient 单例、会话列表、消息映射、runId→sessionKey 映射、
// 流式缓冲、连接状态、断线恢复（chat.history + inFlightRun）

import { create } from 'zustand';
import { WsClient } from '../lib/ws-client';
import { useAuthStore } from './auth';
import type {
  ChatMessage,
  ChatSession,
  ChatEventPayload,
  ChatHistoryResponse,
  ChatSendResponse,
  WsConnectionStatus,
  AcpEvent,
  ChatSendAttachment,
} from '../types/chat';
import {
  getChatAttachmentDataUrl,
  discardChatAttachmentDataUrls,
} from '../lib/openclaw/attachment-payload-store';
import type { ChatAttachment } from '../lib/openclaw/ui-types';

interface ChatState {
  // 连接
  wsClient: WsClient | null;
  connectionStatus: WsConnectionStatus;
  // 会话
  sessions: ChatSession[];
  currentSessionKey: string | null;
  // 消息（按 sessionKey 分组）
  messagesBySession: Record<string, ChatMessage[]>;
  // runId → sessionKey 映射（sessionKey 不在事件帧中，前端必须维护）
  runIdToSession: Record<string, string>;
  // 流式缓冲（runId → 已接收文本）
  streamingBuffers: Record<string, string>;
  // 输入框
  inputText: string;
  // 是否正在发送
  isSending: boolean;
  // 当前选中的模型（provider/model 格式）
  selectedModel: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  setConnectionStatus: (status: WsConnectionStatus) => void;
  handleEvent: (event: string, payload: unknown) => void;
  handleGap: (expectedSeq: number, receivedSeq: number) => void;

  createSession: () => string;
  selectSession: (sessionKey: string) => void;
  loadSessionHistory: (sessionKey: string) => Promise<void>;

  sendMessage: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
  abortRun: (runId: string) => Promise<void>;

  setInputText: (text: string) => void;
  setModel: (model: string | null) => void;
  clearMessages: () => void;
}

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3005/ws';

function generateSessionKey(): string {
  const userId = useAuthStore.getState().user?.id || 'anonymous';
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `chat:${userId}:${ts}:${rand}`;
}

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从 data URL 中提取 base64 内容（去除 data:xxx;base64, 前缀） */
function extractBase64Content(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

/** 根据 mimeType 推断附件类型分类 */
function resolveAttachmentType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

/** 将 ChatAttachment[] 转换为 chat.send 的 wire 格式载荷 */
function buildAttachmentPayload(attachments: ChatAttachment[]): ChatSendAttachment[] {
  const payload: ChatSendAttachment[] = [];
  for (const attachment of attachments) {
    const dataUrl = getChatAttachmentDataUrl(attachment);
    if (!dataUrl) continue;
    payload.push({
      type: resolveAttachmentType(attachment.mimeType),
      mimeType: attachment.mimeType,
      ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
      content: extractBase64Content(dataUrl),
    });
  }
  return payload;
}

/** ACP 事件 → ChatMessage 转换（处理 eventType 命名差异） */
function acpEventsToMessages(sessionKey: string, events: AcpEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const runMap = new Map<string, ChatMessage>();

  for (const evt of events) {
    const { runId } = evt.payload;

    if (evt.type === 'user_message') {
      messages.push({
        id: generateMessageId(),
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
          id: generateMessageId(),
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
          id: generateMessageId(),
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
          id: generateMessageId(),
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
          id: generateMessageId(),
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

export const useChatStore = create<ChatState>((set, get) => ({
  wsClient: null,
  connectionStatus: 'disconnected',
  sessions: [],
  currentSessionKey: null,
  messagesBySession: {},
  runIdToSession: {},
  streamingBuffers: {},
  inputText: '',
  isSending: false,
  selectedModel: null,

  connect: () => {
    const { wsClient } = get();
    if (wsClient) return;

    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const client = new WsClient({
      url: WS_BASE_URL,
      token,
      onStatusChange: (status) => {
        set({ connectionStatus: status });
      },
      onEvent: (event, payload) => {
        get().handleEvent(event, payload);
      },
      onGap: (expected, received) => {
        get().handleGap(expected, received);
      },
      reconnectMaxAttempts: 5,
      requestTimeoutMs: 15000,
    });

    client.connect();
    set({ wsClient: client });
  },

  disconnect: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.close();
      set({ wsClient: null, connectionStatus: 'disconnected' });
    }
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  handleEvent: (event, payload) => {
    if (event !== 'chat') return;

    const chatPayload = payload as ChatEventPayload;
    const { runId, type } = chatPayload;
    const state = get();
    const sessionKey = state.runIdToSession[runId];

    if (!sessionKey) {
      // 未知 runId，可能是其他客户端触发的，忽略
      return;
    }

    const messages = state.messagesBySession[sessionKey] || [];
    const msgIndex = messages.findIndex((m) => m.runId === runId);

    switch (type) {
      case 'text_delta': {
        const delta = (chatPayload as { delta: string }).delta;
        // 更新缓冲
        const buffer = state.streamingBuffers[runId] || '';
        const newBuffer = buffer + delta;
        set({
          streamingBuffers: { ...state.streamingBuffers, [runId]: newBuffer },
        });

        // 更新消息
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            content: newBuffer,
            status: 'streaming',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'tool_call': {
        const toolCall = (chatPayload as { toolCall: { id: string; name: string; args: unknown } }).toolCall;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          const msg = { ...newMessages[msgIndex] };
          msg.toolCalls = [
            ...msg.toolCalls,
            { id: toolCall.id, name: toolCall.name, args: toolCall.args, status: 'pending' },
          ];
          newMessages[msgIndex] = msg;
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'tool_result': {
        const result = (chatPayload as { result: { name: string; content: unknown } }).result;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          const msg = { ...newMessages[msgIndex] };
          msg.toolCalls = msg.toolCalls.map((t) =>
            t.status === 'pending' ? { ...t, result, status: 'completed' as const } : t
          );
          newMessages[msgIndex] = msg;
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'done': {
        const finalText = (chatPayload as { finalText: string }).finalText;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            content: finalText,
            status: 'complete',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        // 清理缓冲
        const newBuffers = { ...state.streamingBuffers };
        delete newBuffers[runId];
        set({ streamingBuffers: newBuffers, isSending: false });
        break;
      }

      case 'error': {
        const errorMsg = (chatPayload as { error: string }).error;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            status: 'error',
            error: errorMsg,
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        const newBuffers = { ...state.streamingBuffers };
        delete newBuffers[runId];
        set({ streamingBuffers: newBuffers, isSending: false });
        break;
      }
    }
  },

  handleGap: (_expected, _received) => {
    // 检测到 seq gap，对当前会话触发 history 恢复
    const { currentSessionKey } = get();
    if (!currentSessionKey) return;
    // 触发 chat.history 恢复
    get().loadSessionHistory(currentSessionKey);
  },

  createSession: () => {
    const sessionKey = generateSessionKey();
    const newSession: ChatSession = {
      sessionKey,
      title: '新对话',
      lastMessageAt: Date.now(),
      messageCount: 0,
    };
    set((state) => ({
      sessions: [newSession, ...state.sessions],
      currentSessionKey: sessionKey,
      messagesBySession: { ...state.messagesBySession, [sessionKey]: [] },
    }));
    return sessionKey;
  },

  selectSession: (sessionKey) => {
    set({ currentSessionKey: sessionKey });
    // 加载历史
    get().loadSessionHistory(sessionKey);
  },

  loadSessionHistory: async (sessionKey) => {
    const { wsClient } = get();
    if (!wsClient) return;

    try {
      const res = await wsClient.request<ChatHistoryResponse>('chat.history', { sessionKey });
      const messages = acpEventsToMessages(sessionKey, res.events);

      // 处理 in-flight run 快照（断线恢复核心）
      if (res.inFlightRun) {
        const { runId, bufferedText, isRunning } = res.inFlightRun;
        // 记录 runId 映射（sessionKey 不在事件帧中，必须维护）
        set((state) => ({
          runIdToSession: { ...state.runIdToSession, [runId]: sessionKey },
        }));

        // 如果有缓冲文本，创建或更新 assistant 消息
        if (bufferedText) {
          const existingIdx = messages.findIndex((m) => m.runId === runId);
          if (existingIdx >= 0) {
            messages[existingIdx].content = bufferedText;
            messages[existingIdx].status = isRunning ? 'streaming' : 'complete';
          } else {
            messages.push({
              id: generateMessageId(),
              sessionKey,
              runId,
              role: 'assistant',
              content: bufferedText,
              toolCalls: [],
              status: isRunning ? 'streaming' : 'complete',
              createdAt: res.inFlightRun.startedAt,
            });
          }
          set((state) => ({
            streamingBuffers: { ...state.streamingBuffers, [runId]: bufferedText },
          }));
        }

        if (isRunning) {
          set({ isSending: true });
        }
      }

      set((state) => ({
        messagesBySession: { ...state.messagesBySession, [sessionKey]: messages },
      }));

      // 更新会话元信息
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionKey === sessionKey
            ? { ...s, messageCount: messages.length, lastMessageAt: Date.now() }
            : s
        ),
      }));
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  },

  sendMessage: async (text, attachments) => {
    const { wsClient, currentSessionKey, selectedModel } = get();
    const hasAttachments = attachments && attachments.length > 0;
    if (!wsClient || !currentSessionKey || (!text.trim() && !hasAttachments)) return;

    const sessionKey = currentSessionKey;
    const runId = generateRunId();

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: generateMessageId(),
      sessionKey,
      role: 'user',
      content: text,
      toolCalls: [],
      status: 'complete',
      createdAt: Date.now(),
    };

    // 添加 assistant 占位消息
    const assistantMsg: ChatMessage = {
      id: generateMessageId(),
      sessionKey,
      runId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      status: 'streaming',
      createdAt: Date.now(),
    };

    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionKey]: [...(state.messagesBySession[sessionKey] || []), userMsg, assistantMsg],
      },
      runIdToSession: { ...state.runIdToSession, [runId]: sessionKey },
      streamingBuffers: { ...state.streamingBuffers, [runId]: '' },
      isSending: true,
      inputText: '',
    }));

    // 更新会话标题（首条消息）
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionKey === sessionKey && s.title === '新对话'
          ? { ...s, title: text.slice(0, 30), lastMessageAt: Date.now(), messageCount: s.messageCount + 1 }
          : s
      ),
    }));

    // 构建附件 wire 载荷
    const attachmentPayload = hasAttachments ? buildAttachmentPayload(attachments!) : undefined;

    try {
      await wsClient.request<ChatSendResponse>('chat.send', {
        sessionKey,
        message: text,
        clientRunId: runId,
        ...(attachmentPayload && attachmentPayload.length > 0
          ? { attachments: attachmentPayload }
          : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
      });
      // 发送成功后清理 base64 数据（保留 previewUrl 供 UI 使用）
      if (hasAttachments) {
        discardChatAttachmentDataUrls(attachments!);
      }
    } catch (err) {
      // 发送失败，标记 assistant 消息为错误
      const errorMsg = err instanceof Error ? err.message : '发送失败';
      set((state) => {
        const msgs = state.messagesBySession[sessionKey] || [];
        const newMsgs = msgs.map((m) =>
          m.runId === runId ? { ...m, status: 'error' as const, error: errorMsg } : m
        );
        return {
          messagesBySession: { ...state.messagesBySession, [sessionKey]: newMsgs },
          isSending: false,
        };
      });
    }
  },

  abortRun: async (runId) => {
    const { wsClient } = get();
    if (!wsClient) return;
    try {
      await wsClient.request('chat.abort', { runId });
    } catch (err) {
      console.error('Failed to abort run:', err);
    }
  },

  setInputText: (text) => set({ inputText: text }),

  setModel: (model) => set({ selectedModel: model }),

  clearMessages: () => {
    const { currentSessionKey } = get();
    if (!currentSessionKey) return;
    set((state) => ({
      messagesBySession: { ...state.messagesBySession, [currentSessionKey]: [] },
      streamingBuffers: {},
      isSending: false,
    }));
  },
}));
