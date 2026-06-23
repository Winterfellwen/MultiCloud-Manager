// AI 对话 Zustand store
// 管理：WsClient 单例、会话列表、消息映射、runId→sessionKey 映射、
// 流式缓冲、连接状态、断线恢复（chat.history + inFlightRun）

import { create } from 'zustand';

export type Mode = 'plan' | 'action' | 'confirm';
import { WsClient } from '../lib/ws-client';
import { MockWsClient } from '../lib/demo/mock-ws-client';
import { getWsBaseUrl } from '../lib/config';
import { useAuthStore } from './auth';
import { useDemoStore } from './demo';
import type {
  ChatMessage,
  ChatSession,
  ChatEventPayload,
  ChatHistoryResponse,
  ChatSendResponse,
  ChatToolResultPayload,
  ContentBlock,
  MessageStatus,
  WsConnectionStatus,
  AcpEvent,
  ChatSendAttachment,
  SessionsListResponse,
  SessionsDeleteBatchResponse,
} from '../types/chat';
import {
  getChatAttachmentDataUrl,
  discardChatAttachmentDataUrls,
} from '../lib/openclaw/attachment-payload-store';
import {
  appendReasoningDelta,
  appendTextDelta,
  appendToolCall,
  updateToolResult,
  extractTextFromBlocks,
  extractReasoningFromBlocks,
  extractToolCallsFromBlocks,
} from '../lib/openclaw/blocks-helper';
import type { ChatAttachment } from '../lib/openclaw/ui-types';

interface ChatState {
  // 连接
  wsClient: WsClient | MockWsClient | null;
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
  // 是否启用深度思考模式（默认 true）
  enableThinking: boolean;
  // 推理努力程度：low / medium / high
  reasoningEffort: 'low' | 'medium' | 'high';
  // 模式状态：plan / action / confirm
  mode: Mode;
  // 已查看的会话（用于清除"已完成"状态指示）
  seenSessions: Set<string>;
  // 会话列表过滤器
  sessionsFilter: 'mine' | 'team' | 'all';

  // Actions
  connect: () => void;
  disconnect: () => void;
  setConnectionStatus: (status: WsConnectionStatus) => void;
  handleEvent: (event: string, payload: unknown) => void;
  handleGap: (expectedSeq: number, receivedSeq: number) => void;

  createSession: () => string;
  selectSession: (sessionKey: string) => void;
  markSessionSeen: (sessionKey: string) => void;
  deleteSession: (sessionKey: string) => Promise<void>;
  deleteSessions: (sessionKeys: string[]) => Promise<void>;
  loadSessionHistory: (sessionKey: string) => Promise<void>;
  fetchSessions: (filter?: 'mine' | 'team' | 'all') => Promise<void>;
  updateSessionTitle: (sessionKey: string, title: string) => Promise<void>;

  sendMessage: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
  abortRun: (runId: string) => Promise<void>;

  setInputText: (text: string) => void;
  setModel: (model: string | null) => void;
  setEnableThinking: (enabled: boolean) => void;
  setReasoningEffort: (effort: 'low' | 'medium' | 'high') => void;
  setMode: (mode: Mode) => void;
  clearMessages: () => void;
}

function buildWsBaseUrl(): string {
  return getWsBaseUrl();
}

const WS_BASE_URL = buildWsBaseUrl();

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

// ===== localStorage 持久化（仅用于用户偏好设置） =====

const LS_KEY_MODE = 'chat-mode';
const LS_KEY_MODEL = 'chat-selected-model';
const LS_KEY_SESSION = 'chat-current-session';

const initialMode = (localStorage.getItem(LS_KEY_MODE) as Mode) || 'plan';
const initialSelectedModel = localStorage.getItem(LS_KEY_MODEL) || null;
const initialSessionKey = localStorage.getItem(LS_KEY_SESSION) || null;

// 正在加载历史的 session 集合（防止并发调用 loadSessionHistory 导致竞态）
const loadingSessions = new Set<string>();

// 安全超时：isSending 从 inFlightRun snapshot 设置时启动，防止 done 事件丢失导致卡死
let isSendingSafetyTimer: ReturnType<typeof setTimeout> | null = null;
const IS_SENDING_SAFETY_TIMEOUT_MS = 15_000;

/** ACP 事件 → ChatMessage 转换（处理 eventType 命名差异） */
function acpEventsToMessages(sessionKey: string, events: AcpEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const runMap = new Map<string, ChatMessage>();
  // 记录已 complete 的 runId，避免 assistant_complete 之后的 assistant_delta 重复追加
  const completedRuns = new Set<string>();

  /** 获取或创建 assistant 消息（附带空 blocks 数组） */
  function getOrCreateAssistantMsg(runId: string, createdAt: number, status: MessageStatus = 'streaming'): ChatMessage {
    let msg = runMap.get(runId);
    if (!msg) {
      msg = {
        id: generateMessageId(),
        sessionKey,
        runId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        blocks: [],
        status,
        createdAt,
      };
      runMap.set(runId, msg);
      messages.push(msg);
    }
    return msg;
  }

  for (const evt of events) {
    const { runId } = evt.payload;
    const createdAt = evt.timestamp || evt.seq * 1000;

    if (evt.type === 'user_message') {
      messages.push({
        id: generateMessageId(),
        sessionKey,
        runId,
        role: 'user',
        content: evt.payload.message || '',
        toolCalls: [],
        status: 'complete',
        createdAt,
      });
    } else if (evt.type === 'assistant_delta') {
      // 如果该 run 已经 complete（finalText 已设置），忽略后续的 delta 事件
      if (completedRuns.has(runId)) continue;
      const msg = getOrCreateAssistantMsg(runId, createdAt);
      const delta = evt.payload.delta || '';
      appendTextDelta(msg.blocks!, delta);
      msg.content = extractTextFromBlocks(msg.blocks);
      msg.status = 'streaming';
    } else if (evt.type === 'assistant_reasoning') {
      // 推理过程事件：追加到 blocks 中的 reasoning block
      const msg = getOrCreateAssistantMsg(runId, createdAt);
      const delta = evt.payload.delta || '';
      appendReasoningDelta(msg.blocks!, delta);
      msg.reasoning = extractReasoningFromBlocks(msg.blocks);
      msg.status = 'streaming';
    } else if (evt.type === 'assistant_complete') {
      completedRuns.add(runId);
      const msg = getOrCreateAssistantMsg(runId, createdAt, 'complete');
      // 不用 finalText 覆盖：finalText 是全量累加文本，多迭代场景下会与各 text_delta block 重复
      // 各 text_delta block 已按正确时序记录，保留原样即可
      msg.content = extractTextFromBlocks(msg.blocks) || evt.payload.finalText || '';
      msg.status = 'complete';
    } else if (evt.type === 'tool_call') {
      const msg = getOrCreateAssistantMsg(runId, createdAt);
      if (evt.payload.toolCall) {
        const tc = {
          id: evt.payload.toolCall.id,
          name: evt.payload.toolCall.name,
          args: evt.payload.toolCall.arguments,
          status: 'pending' as const,
        };
        appendToolCall(msg.blocks!, tc);
        msg.toolCalls = extractToolCallsFromBlocks(msg.blocks);
      }
    } else if (evt.type === 'tool_result') {
      const msg = getOrCreateAssistantMsg(runId, createdAt);
      if (evt.payload.result) {
        const resultPayload = evt.payload.result;
        const result = {
          name: resultPayload.name || '',
          content: resultPayload.data ?? resultPayload.error ?? evt.payload.result,
        };
        updateToolResult(msg.blocks!, result, evt.payload.toolCallId);
        msg.toolCalls = extractToolCallsFromBlocks(msg.blocks);
      }
    }
  }

  // 历史加载完成：将所有仍为 streaming 状态的 assistant 消息标记为 complete
  // （真正正在运行的 run 会通过 inFlightRun 快照单独处理，不会走到这里）
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.status === 'streaming') {
      msg.status = 'complete';
    }
  }

  return messages;
}

export const useChatStore = create<ChatState>((set, get) => ({
  wsClient: null,
  connectionStatus: 'disconnected',
  sessions: [],
  currentSessionKey: initialSessionKey,
  messagesBySession: {},
  runIdToSession: {},
  streamingBuffers: {},
  inputText: '',
  isSending: false,
  selectedModel: initialSelectedModel,
  enableThinking: true,
  reasoningEffort: 'high',
  mode: initialMode,
  seenSessions: new Set<string>(),
  sessionsFilter: 'mine',

  connect: () => {
    const { wsClient } = get();
    const isDemoMode = useDemoStore.getState().isDemoMode;

    // 如果已存在客户端但模式不匹配，先断开旧的再创建新的
    if (wsClient) {
      const isMockClient = wsClient instanceof MockWsClient;
      if (isMockClient === isDemoMode) {
        return; // 类型匹配，跳过
      }
      wsClient.close();
      set({ wsClient: null });
    }

    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    // 共享的回调配置
    const clientOptions = {
      onStatusChange: (status: WsConnectionStatus) => {
        set({ connectionStatus: status });
        // 连接成功（收到 hello-ok）后自动恢复当前会话历史
        // 覆盖首次连接和断线重连两种场景
        if (status === 'connected') {
          get().fetchSessions();
          const { currentSessionKey } = get();
          if (currentSessionKey) {
            get().loadSessionHistory(currentSessionKey);
          }
        }
      },
      onEvent: (event: string, payload: unknown) => {
        get().handleEvent(event, payload);
      },
      onGap: (expected: number, received: number) => {
        get().handleGap(expected, received);
      },
      reconnectMaxAttempts: 5,
      requestTimeoutMs: 15000,
    };

    let client: WsClient | MockWsClient;
    if (isDemoMode) {
      // Demo 模式：使用 MockWsClient，本地模拟 WebSocket 协议
      client = new MockWsClient(clientOptions);
    } else {
      // 正常模式：连接真实 ai-gateway WebSocket 服务
      client = new WsClient({
        ...clientOptions,
        url: WS_BASE_URL,
        token,
      });
    }

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
    let sessionKey = state.runIdToSession[runId];

    // 竞态修复：如果 runIdToSession 中没有映射（页面刷新后 done 事件先到），
    // 从 messagesBySession 中查找匹配的 session
    if (!sessionKey) {
      for (const [sk, msgs] of Object.entries(state.messagesBySession)) {
        if (msgs.some((m) => m.runId === runId)) {
          sessionKey = sk;
          // 补充映射，后续事件无需再查
          set((s) => ({ runIdToSession: { ...s.runIdToSession, [runId]: sk } }));
          break;
        }
      }
    }

    if (!sessionKey) {
      // 未知 runId，忽略
      return;
    }

    const messages = state.messagesBySession[sessionKey] || [];
    // 关键：assistant 事件必须只更新 role='assistant' 的消息
    // 因为 userMsg 和 assistantMsg 共享相同的 runId
    const msgIndex = messages.findIndex((m) => m.runId === runId && m.role === 'assistant');
    const newMessages = [...messages];

    switch (type) {
      case 'text_delta': {
        const delta = (chatPayload as { delta: string }).delta;
        // 更新缓冲
        const buffer = state.streamingBuffers[runId] || '';
        const newBuffer = buffer + delta;
        set({
          streamingBuffers: { ...state.streamingBuffers, [runId]: newBuffer },
        });

        // 更新消息：追加到 blocks 并同步 content
        if (msgIndex >= 0) {
          const existing = messages[msgIndex];
          const newBlocks = existing.blocks ? existing.blocks.map((b) => ({ ...b })) : [];
          appendTextDelta(newBlocks, delta);
          newMessages[msgIndex] = {
            ...existing,
            blocks: newBlocks,
            content: newBuffer,
            status: 'streaming',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'reasoning_delta': {
        // 推理过程 delta：追加到 blocks 中的 reasoning block
        const delta = (chatPayload as { delta: string }).delta;
        if (msgIndex >= 0) {
          const existing = messages[msgIndex];
          const newBlocks = existing.blocks ? existing.blocks.map((b) => ({ ...b })) : [];
          appendReasoningDelta(newBlocks, delta);
          newMessages[msgIndex] = {
            ...existing,
            blocks: newBlocks,
            reasoning: extractReasoningFromBlocks(newBlocks),
            status: 'streaming',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'tool_call': {
        const toolCall = (chatPayload as { toolCall: { id: string; name: string; arguments: unknown } }).toolCall;
        if (msgIndex >= 0) {
          const existing = messages[msgIndex];
          const newBlocks = existing.blocks ? existing.blocks.map((b) => ({ ...b })) : [];
          const tc = { id: toolCall.id, name: toolCall.name, args: toolCall.arguments, status: 'pending' as const };
          appendToolCall(newBlocks, tc);
          newMessages[msgIndex] = {
            ...existing,
            blocks: newBlocks,
            toolCalls: extractToolCallsFromBlocks(newBlocks),
            status: 'streaming',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'tool_result': {
        const chatResult = (chatPayload as ChatToolResultPayload).result;
        const toolCallId = (chatPayload as ChatToolResultPayload).toolCallId;
        // 后端 tool_result payload 结构：{ name, success, data, error? }
        // ToolCallCard 期望：{ name, content }
        // 将 data 映射到 content
        const result = {
          name: chatResult?.name || '',
          content: chatResult?.data ?? chatResult?.error ?? chatResult,
        };
        if (msgIndex >= 0) {
          const existing = messages[msgIndex];
          const newBlocks = existing.blocks ? existing.blocks.map((b) => ({ ...b })) : [];
          updateToolResult(newBlocks, result, toolCallId);
          newMessages[msgIndex] = {
            ...existing,
            blocks: newBlocks,
            toolCalls: extractToolCallsFromBlocks(newBlocks),
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'done': {
        const finalText = (chatPayload as { finalText: string }).finalText;
        // 清除安全超时（done 事件已到达，无需兜底）
        if (isSendingSafetyTimer) { clearTimeout(isSendingSafetyTimer); isSendingSafetyTimer = null; }
        if (msgIndex >= 0) {
          const existing = messages[msgIndex];
          const newBlocks = existing.blocks ? existing.blocks.map((b) => ({ ...b })) : [];
          // 不用 finalText 覆盖：finalText 是全量累加文本，多迭代场景下会与各 text_delta block 重复
          // 各 text_delta block 已按正确时序记录，保留原样即可
          newMessages[msgIndex] = {
            ...existing,
            blocks: newBlocks,
            content: extractTextFromBlocks(newBlocks) || finalText || '',
            status: 'complete',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        // 清理缓冲
        const newBuffers = { ...state.streamingBuffers };
        delete newBuffers[runId];
        // 更新会话元信息并持久化（刷新后 messageCount 正确）
        set((s) => ({
          streamingBuffers: newBuffers,
          isSending: false,
          sessions: s.sessions.map((sess) =>
            sess.sessionKey === sessionKey
              ? { ...sess, messageCount: (s.messagesBySession[sessionKey] || []).length, lastMessageAt: Date.now() }
              : sess
          ),
        }));
        break;
      }

      case 'error': {
        const errorMsg = (chatPayload as { error: string }).error;
        if (isSendingSafetyTimer) { clearTimeout(isSendingSafetyTimer); isSendingSafetyTimer = null; }
        if (msgIndex >= 0) {
          newMessages[msgIndex] = {
            ...messages[msgIndex],
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

      case 'aborted': {
        // 中止事件：将消息标记为 aborted，清理缓冲
        if (isSendingSafetyTimer) { clearTimeout(isSendingSafetyTimer); isSendingSafetyTimer = null; }
        if (msgIndex >= 0) {
          newMessages[msgIndex] = {
            ...messages[msgIndex],
            status: 'aborted',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        const abortedBuffers = { ...state.streamingBuffers };
        delete abortedBuffers[runId];
        set((s) => ({
          streamingBuffers: abortedBuffers,
          isSending: false,
          sessions: s.sessions.map((sess) =>
            sess.sessionKey === sessionKey
              ? { ...sess, messageCount: (s.messagesBySession[sessionKey] || []).length, lastMessageAt: Date.now() }
              : sess
          ),
        }));
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
    localStorage.setItem(LS_KEY_SESSION, sessionKey);

    // Demo 模式：同步到 mock storage，确保后续 fetchSessions 能看到这个会话
    if (useDemoStore.getState().isDemoMode) {
      try {
        const raw = localStorage.getItem('demo-chat-sessions');
        const list = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
        const userId = useAuthStore.getState().user?.id || 'demo-u-1';
        const username = useAuthStore.getState().user?.username || 'demo-admin';
        list.unshift({
          sessionKey,
          title: '新对话',
          username,
          userId,
          messageCount: 0,
          lastMessageAt: Date.now(),
          createdAt: Date.now(),
        });
        localStorage.setItem('demo-chat-sessions', JSON.stringify(list));
      } catch {
        // ignore
      }
    }

    return sessionKey;
  },

  selectSession: (sessionKey) => {
    set({ currentSessionKey: sessionKey });
    localStorage.setItem(LS_KEY_SESSION, sessionKey);
    // 加载历史
    get().loadSessionHistory(sessionKey);
    // 标记会话已查看，清除"已完成"状态指示
    get().markSessionSeen(sessionKey);
  },

  markSessionSeen: (sessionKey) => {
    set((state) => {
      const newSeenSessions = new Set(state.seenSessions);
      newSeenSessions.add(sessionKey);
      return { seenSessions: newSeenSessions };
    });
  },

  deleteSession: async (sessionKey) => {
    await get().deleteSessions([sessionKey]);
  },

  deleteSessions: async (sessionKeys) => {
    const { wsClient, currentSessionKey } = get();
    if (!wsClient || sessionKeys.length === 0) return;

    try {
      await wsClient.request<SessionsDeleteBatchResponse>('sessions.deleteBatch', { sessionKeys });
    } catch (err) {
      console.error('Failed to delete sessions on server:', err);
    }

    // 清理本地状态
    set((state) => {
      const newSessions = state.sessions.filter(s => !sessionKeys.includes(s.sessionKey));
      const newMessagesBySession = { ...state.messagesBySession };
      const newRunIdToSession: Record<string, string> = {};
      const newBuffers: Record<string, string> = {};

      for (const key of sessionKeys) {
        delete newMessagesBySession[key];
      }
      for (const [rid, sk] of Object.entries(state.runIdToSession)) {
        if (!sessionKeys.includes(sk)) newRunIdToSession[rid] = sk;
      }
      for (const [rid, buf] of Object.entries(state.streamingBuffers)) {
        if (!sessionKeys.includes(state.runIdToSession[rid] || '')) newBuffers[rid] = buf;
      }

      const newCurrent = sessionKeys.includes(currentSessionKey || '')
        ? (newSessions.length > 0 ? newSessions[0].sessionKey : null)
        : currentSessionKey;

      // 持久化新的 currentSessionKey
      if (newCurrent) {
        localStorage.setItem(LS_KEY_SESSION, newCurrent);
      } else {
        localStorage.removeItem(LS_KEY_SESSION);
      }

      return {
        sessions: newSessions,
        messagesBySession: newMessagesBySession,
        runIdToSession: newRunIdToSession,
        streamingBuffers: newBuffers,
        currentSessionKey: newCurrent,
        isSending: sessionKeys.includes(currentSessionKey || '') ? false : state.isSending,
      };
    });

    // 刷新列表
    get().fetchSessions();
  },

  fetchSessions: async (filter) => {
    const { wsClient } = get();
    if (!wsClient) return;

    const f = filter || get().sessionsFilter;
    try {
      const res = await wsClient.request<SessionsListResponse>('sessions.list', { filter: f });
      const sessions: ChatSession[] = res.sessions.map(s => ({
        sessionKey: s.sessionKey,
        title: s.title,
        lastMessageAt: s.lastMessageAt,
        messageCount: s.messageCount,
        userId: s.userId,
        username: s.username,
        createdAt: s.createdAt,
      }));
      
      // 验证 currentSessionKey 是否仍在列表中
      const { currentSessionKey } = get();
      let newCurrent = currentSessionKey;
      if (currentSessionKey && !sessions.find(s => s.sessionKey === currentSessionKey)) {
        // 当前会话不在列表中（可能已被删除），选择第一个
        newCurrent = sessions.length > 0 ? sessions[0].sessionKey : null;
        if (newCurrent) {
          localStorage.setItem(LS_KEY_SESSION, newCurrent);
        } else {
          localStorage.removeItem(LS_KEY_SESSION);
        }
      }
      
      set({ sessions, sessionsFilter: f, currentSessionKey: newCurrent });
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  },

  updateSessionTitle: async (sessionKey, title) => {
    const { wsClient } = get();
    if (!wsClient) return;

    try {
      await wsClient.request('sessions.updateTitle', { sessionKey, title });
      set((state) => ({
        sessions: state.sessions.map(s =>
          s.sessionKey === sessionKey ? { ...s, title } : s
        ),
      }));
    } catch (err) {
      console.error('Failed to update session title:', err);
    }
  },

  loadSessionHistory: async (sessionKey) => {
    const { wsClient } = get();
    if (!wsClient) return;

    // 并发调用保护：同一 session 正在加载时跳过（防止刷新/重连时多次调用导致竞态）
    if (loadingSessions.has(sessionKey)) return;
    loadingSessions.add(sessionKey);

    try {
      const res = await wsClient.request<ChatHistoryResponse>('chat.history', { sessionKey });
      const serverMessages = acpEventsToMessages(sessionKey, res.events);

      // 获取本地已有消息
      const localMessages = get().messagesBySession[sessionKey] || [];

      // 合并策略（按 runId 去重，保留服务端时间顺序）：
      // 1. 以服务端消息为基础（保持事件时间顺序）
      // 2. 对正在 streaming 的 run，用本地版本（blocks 更完整）
      // 3. 本地有但服务端没有的消息（如刚发送还没入库的），追加到对应位置
      const serverRunIds = new Set(
        serverMessages.filter((m) => m.runId).map((m) => m.runId!)
      );
      const localStreamingRuns = new Set(
        localMessages
          .filter((m) => m.status === 'streaming' && m.runId)
          .map((m) => m.runId!)
      );

      // 关键：构建 (runId + role) 的唯一 key 来比较服务端消息（因为 user 和 assistant 共享 runId）
      const serverMsgKeys = new Set(
        serverMessages.filter((m) => m.runId).map((m) => `${m.runId}_${m.role}`)
      );

      // 对服务端消息，如果本地有 streaming 版本（相同 runId + 相同 role），用本地版本（blocks 更完整）
      const finalMessages: ChatMessage[] = serverMessages.map((msg) => {
        if (msg.runId && localStreamingRuns.has(msg.runId)) {
          const localMsg = localMessages.find((m) => m.runId === msg.runId && m.role === msg.role);
          if (localMsg && localMsg.blocks && localMsg.blocks.length > 0) {
            return { ...msg, blocks: localMsg.blocks, content: localMsg.content, reasoning: localMsg.reasoning };
          }
        }
        return msg;
      });

      // 追加本地独有的消息（服务端没有的 runId+role 组合，如刚发送还没入库的用户消息或正在流式传输的助手消息）
      for (const localMsg of localMessages) {
        const key = `${localMsg.runId}_${localMsg.role}`;
        if (!localMsg.runId || !serverMsgKeys.has(key)) {
          finalMessages.push(localMsg);
        }
      }

      // 处理 in-flight run 快照（断线恢复核心）
      // 关键：如果该 runId 已经存在于 serverMessages（即数据库中有完整事件），
      // 跳过 inFlightRun 处理（避免 assistant 消息重复）
      if (res.inFlightRun && !serverRunIds.has(res.inFlightRun.runId)) {
        const { runId, bufferedText, bufferedReasoning, isRunning } = res.inFlightRun;
        // 记录 runId 映射
        set((state) => ({
          runIdToSession: { ...state.runIdToSession, [runId]: sessionKey },
        }));

        // 始终创建 assistant 占位符（包括 bufferedText 为空时），确保 done 事件有 msgIndex
        if (isRunning || bufferedText || bufferedReasoning) {
          const snapshotBlocks: ContentBlock[] = [];
          if (bufferedReasoning) {
            snapshotBlocks.push({ type: 'reasoning', id: `blk-r-${Date.now()}`, content: bufferedReasoning });
          }
          if (bufferedText) {
            snapshotBlocks.push({ type: 'text', id: `blk-t-${Date.now()}`, content: bufferedText });
          }
          // 如果没有任何 block，创建空 text block 作为占位
          if (snapshotBlocks.length === 0) {
            snapshotBlocks.push({ type: 'text', id: `blk-t-${Date.now()}`, content: '' });
          }
          finalMessages.push({
            id: generateMessageId(),
            sessionKey,
            runId,
            role: 'assistant',
            content: bufferedText,
            ...(bufferedReasoning ? { reasoning: bufferedReasoning } : {}),
            toolCalls: [],
            blocks: snapshotBlocks,
            status: isRunning ? 'streaming' : 'complete',
            createdAt: res.inFlightRun.startedAt,
          });
          if (bufferedText) {
            set((state) => ({
              streamingBuffers: { ...state.streamingBuffers, [runId]: bufferedText },
            }));
          }
        }

        if (isRunning) {
          set({ isSending: true });
          // 安全超时：如果 done 事件丢失（竞态条件），超时后强制重置 isSending
          if (isSendingSafetyTimer) clearTimeout(isSendingSafetyTimer);
          isSendingSafetyTimer = setTimeout(() => {
            const state = get();
            if (state.isSending) {
              console.warn('[chat] isSending safety timeout: forcing reset');
              // 将所有 streaming 消息标记为 complete
              const sessionMessages = state.messagesBySession[sessionKey] || [];
              const updatedMessages = sessionMessages.map((m) =>
                m.runId === runId && m.status === 'streaming' ? { ...m, status: 'complete' as const } : m
              );
              set({
                isSending: false,
                messagesBySession: { ...state.messagesBySession, [sessionKey]: updatedMessages },
              });
            }
            isSendingSafetyTimer = null;
          }, IS_SENDING_SAFETY_TIMEOUT_MS);
        }
      }

      // 竞态修复：如果 inFlightRun 的 runId 已在 serverRunIds 中（DB 有 user_message 但无 assistant_complete），
      // acpEventsToMessages 已将 assistant 消息错误标记为 complete。需要恢复为 streaming 并设置 isSending。
      if (res.inFlightRun && serverRunIds.has(res.inFlightRun.runId) && res.inFlightRun.isRunning) {
        const { runId, bufferedText, bufferedReasoning } = res.inFlightRun;
        // 记录 runId 映射
        set((state) => ({
          runIdToSession: { ...state.runIdToSession, [runId]: sessionKey },
        }));

        // 查找或创建 assistant 消息
        const existingIdx = finalMessages.findIndex((m) => m.runId === runId && m.role === 'assistant');
        if (existingIdx >= 0) {
          // 已有 assistant 消息，恢复为 streaming 状态
          finalMessages[existingIdx] = { ...finalMessages[existingIdx], status: 'streaming' };
        } else {
          // 没有 assistant 消息（DB 只有 user_message），创建占位消息
          const snapshotBlocks: ContentBlock[] = [];
          if (bufferedReasoning) {
            snapshotBlocks.push({ type: 'reasoning', id: `blk-r-${Date.now()}`, content: bufferedReasoning });
          }
          if (bufferedText) {
            snapshotBlocks.push({ type: 'text', id: `blk-t-${Date.now()}`, content: bufferedText });
          }
          if (snapshotBlocks.length === 0) {
            snapshotBlocks.push({ type: 'text', id: `blk-t-${Date.now()}`, content: '' });
          }
          finalMessages.push({
            id: generateMessageId(),
            sessionKey,
            runId,
            role: 'assistant',
            content: bufferedText || '',
            ...(bufferedReasoning ? { reasoning: bufferedReasoning } : {}),
            toolCalls: [],
            blocks: snapshotBlocks,
            status: 'streaming',
            createdAt: res.inFlightRun.startedAt,
          });
        }

        set({ isSending: true });
        // 同样启动安全超时
        if (isSendingSafetyTimer) clearTimeout(isSendingSafetyTimer);
        isSendingSafetyTimer = setTimeout(() => {
          const state = get();
          if (state.isSending) {
            console.warn('[chat] isSending safety timeout (race fix): forcing reset');
            const sessionMessages = state.messagesBySession[sessionKey] || [];
            const msgs = sessionMessages.map((m) =>
              m.runId === runId && m.status === 'streaming' ? { ...m, status: 'complete' as const } : m
            );
            set({
              isSending: false,
              messagesBySession: { ...state.messagesBySession, [sessionKey]: msgs },
            });
          }
          isSendingSafetyTimer = null;
        }, IS_SENDING_SAFETY_TIMEOUT_MS);
      }

      set((state) => ({
        messagesBySession: { ...state.messagesBySession, [sessionKey]: finalMessages },
      }));

      // 更新会话元信息
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionKey === sessionKey
            ? { ...s, messageCount: finalMessages.length, lastMessageAt: Date.now() }
            : s
        ),
      }));
    } catch (err) {
      console.error('Failed to load session history:', err);
    } finally {
      loadingSessions.delete(sessionKey);
    }
  },

  sendMessage: async (text, attachments) => {
    const { wsClient, currentSessionKey, selectedModel, enableThinking, reasoningEffort, mode } = get();
    const hasAttachments = attachments && attachments.length > 0;
    if (!wsClient || !currentSessionKey || (!text.trim() && !hasAttachments)) return;

    const sessionKey = currentSessionKey;
    const runId = generateRunId();

    // 添加用户消息（附带 runId 以便去重）
    const userMsg: ChatMessage = {
      id: generateMessageId(),
      sessionKey,
      runId,
      role: 'user',
      content: text,
      toolCalls: [],
      status: 'complete',
      createdAt: Date.now(),
    };

    // 添加 assistant 占位消息（附带空 blocks 数组）
    const assistantMsg: ChatMessage = {
      id: generateMessageId(),
      sessionKey,
      runId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      blocks: [],
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
        enableThinking,
        reasoningEffort,
        mode,
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

    // 立即清理本地状态（不等后端响应，避免 UI 卡住）
    const sessionKey = get().runIdToSession[runId];
    set((state) => {
      const newBuffers = { ...state.streamingBuffers };
      delete newBuffers[runId];
      // 将对应消息标记为 aborted
      const messages = state.messagesBySession[sessionKey] || [];
      const newMessages = messages.map((m) =>
        m.runId === runId ? { ...m, status: 'aborted' as const } : m
      );
      return {
        streamingBuffers: newBuffers,
        isSending: false,
        messagesBySession: sessionKey
          ? { ...state.messagesBySession, [sessionKey]: newMessages }
          : state.messagesBySession,
      };
    });

    // 发送 abort 请求到后端
    try {
      await wsClient.request('chat.abort', { runId });
    } catch (err) {
      console.error('Failed to abort run:', err);
    }
  },

  setInputText: (text) => set({ inputText: text }),

  setModel: (model) => {
    set({ selectedModel: model });
    if (model) {
      localStorage.setItem(LS_KEY_MODEL, model);
    } else {
      localStorage.removeItem(LS_KEY_MODEL);
    }
  },

  setEnableThinking: (enabled) => set({ enableThinking: enabled }),

  setReasoningEffort: (effort) => set({ reasoningEffort: effort }),

  setMode: (mode) => {
    localStorage.setItem(LS_KEY_MODE, mode);
    set({ mode });
  },

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
