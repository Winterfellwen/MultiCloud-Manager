// AI 对话 Zustand store
// 管理：WsClient 单例、会话列表、消息映射、runId→sessionKey 映射、
// 流式缓冲、连接状态、断线恢复（chat.history + inFlightRun）

import { create } from 'zustand';

export type Mode = 'plan' | 'action' | 'confirm';
import { WsClient } from '../lib/ws-client';
import { useAuthStore } from './auth';
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
  // 是否启用深度思考模式（默认 true）
  enableThinking: boolean;
  // 推理努力程度：low / medium / high
  reasoningEffort: 'low' | 'medium' | 'high';
  // 模式状态：plan / action / confirm
  mode: Mode;
  // 已查看的会话（用于清除"已完成"状态指示）
  seenSessions: Set<string>;

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
  loadSessionHistory: (sessionKey: string) => Promise<void>;

  sendMessage: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
  abortRun: (runId: string) => Promise<void>;

  setInputText: (text: string) => void;
  setModel: (model: string | null) => void;
  setEnableThinking: (enabled: boolean) => void;
  setReasoningEffort: (effort: 'low' | 'medium' | 'high') => void;
  setMode: (mode: Mode) => void;
  clearMessages: () => void;
}

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || (import.meta.env.PROD ? 'ws://localhost/ws' : 'ws://localhost:3005/ws');

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

// ===== localStorage 持久化（刷新页面后恢复会话） =====

const LS_KEY_SESSIONS = 'cloudops:chat:sessions';
const LS_KEY_CURRENT = 'cloudops:chat:currentSessionKey';
const LS_KEY_RUN_MAP = 'cloudops:chat:runIdToSession';
const LS_KEY_MODE = 'chat-mode';
const LS_KEY_MODEL = 'chat-selected-model';

/** 安全读取 localStorage 中的 JSON 值 */
function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 安全写入 localStorage */
function writeLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略写入失败（如配额超限或隐私模式）
  }
}

/** 持久化会话相关状态到 localStorage */
function persistChatState(state: {
  sessions: ChatSession[];
  currentSessionKey: string | null;
  runIdToSession: Record<string, string>;
}): void {
  writeLocalStorage(LS_KEY_SESSIONS, state.sessions);
  writeLocalStorage(LS_KEY_CURRENT, state.currentSessionKey);
  writeLocalStorage(LS_KEY_RUN_MAP, state.runIdToSession);
}

// 初始化时从 localStorage 恢复（模块加载时执行一次）
const initialSessions = readLocalStorage<ChatSession[]>(LS_KEY_SESSIONS, []);
const initialCurrentSessionKey = readLocalStorage<string | null>(LS_KEY_CURRENT, null);
const initialRunIdToSession = readLocalStorage<Record<string, string>>(LS_KEY_RUN_MAP, {});
const initialMode = (localStorage.getItem(LS_KEY_MODE) as Mode) || 'plan';
const initialSelectedModel = localStorage.getItem(LS_KEY_MODEL) || null;

// 正在加载历史的 session 集合（防止并发调用 loadSessionHistory 导致竞态）
const loadingSessions = new Set<string>();

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
  // 从 localStorage 恢复（刷新页面后保留会话列表和当前会话）
  sessions: initialSessions,
  currentSessionKey: initialCurrentSessionKey,
  messagesBySession: {},
  runIdToSession: initialRunIdToSession,
  streamingBuffers: {},
  inputText: '',
  isSending: false,
  selectedModel: initialSelectedModel,
  enableThinking: true,
  reasoningEffort: 'high',
  mode: initialMode,
  seenSessions: new Set<string>(),

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
        // 连接成功（收到 hello-ok）后自动恢复当前会话历史
        // 覆盖首次连接和断线重连两种场景
        if (status === 'connected') {
          const { currentSessionKey } = get();
          if (currentSessionKey) {
            get().loadSessionHistory(currentSessionKey);
          }
        }
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
        persistChatState(get());
        break;
      }

      case 'error': {
        const errorMsg = (chatPayload as { error: string }).error;
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
        persistChatState(get());
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
    persistChatState(get());
    return sessionKey;
  },

  selectSession: (sessionKey) => {
    set({ currentSessionKey: sessionKey });
    persistChatState(get());
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
    const { wsClient, currentSessionKey } = get();

    // 1. 调用后端删除会话（中止 run + 清理数据库事件）
    if (wsClient) {
      try {
        await wsClient.request('sessions.delete', { sessionKey });
      } catch (err) {
        console.error('Failed to delete session on server:', err);
        // 即使后端删除失败，也继续清理本地状态
      }
    }

    // 2. 清理本地状态
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.sessionKey !== sessionKey);
      const newMessagesBySession = { ...state.messagesBySession };
      delete newMessagesBySession[sessionKey];

      // 清理 runIdToSession 中属于该 session 的映射
      const newRunIdToSession: Record<string, string> = {};
      for (const [rid, sk] of Object.entries(state.runIdToSession)) {
        if (sk !== sessionKey) {
          newRunIdToSession[rid] = sk;
        }
      }

      // 清理 streamingBuffers 中属于该 session 的 run
      const newBuffers: Record<string, string> = {};
      for (const [rid, buf] of Object.entries(state.streamingBuffers)) {
        if (state.runIdToSession[rid] !== sessionKey) {
          newBuffers[rid] = buf;
        }
      }

      // 如果删除的是当前会话，切换到第一个可用会话（或 null）
      const newCurrent = currentSessionKey === sessionKey
        ? (newSessions.length > 0 ? newSessions[0].sessionKey : null)
        : currentSessionKey;

      return {
        sessions: newSessions,
        messagesBySession: newMessagesBySession,
        runIdToSession: newRunIdToSession,
        streamingBuffers: newBuffers,
        currentSessionKey: newCurrent,
        isSending: currentSessionKey === sessionKey ? false : state.isSending,
      };
    });

    persistChatState(get());

    // 3. 如果切换了会话，加载新会话历史
    const newCurrent = get().currentSessionKey;
    if (newCurrent && newCurrent !== currentSessionKey) {
      get().loadSessionHistory(newCurrent);
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
        persistChatState(get());

        // 如果有缓冲文本或推理过程，创建 assistant 消息（runId 不存在于 serverMessages）
        if (bufferedText || bufferedReasoning) {
          const snapshotBlocks: ContentBlock[] = [];
          if (bufferedReasoning) {
            snapshotBlocks.push({ type: 'reasoning', id: `blk-r-${Date.now()}`, content: bufferedReasoning });
          }
          if (bufferedText) {
            snapshotBlocks.push({ type: 'text', id: `blk-t-${Date.now()}`, content: bufferedText });
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
        }
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
      persistChatState(get());
    } catch (err) {
      console.error('Failed to load session history:', err);
    } finally {
      loadingSessions.delete(sessionKey);
    }
  },

  sendMessage: async (text, attachments) => {
    const { wsClient, currentSessionKey, selectedModel, enableThinking, reasoningEffort } = get();
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
    // 持久化 runIdToSession 和 sessions（刷新后恢复运行中的任务路由）
    persistChatState(get());

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
