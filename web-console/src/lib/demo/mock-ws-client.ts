// Demo 模式 WebSocket 模拟器
// 模拟 ai-gateway WebSocket 协议，本地生成响应
// 支持 sessions.list / chat.history / chat.send / chat.abort / sessions.deleteBatch / sessions.updateTitle
// 3 个模式（plan / action / confirm）有不同风格的推理和响应内容

import type {
  WsConnectionStatus,
  ChatSendResponse,
  ChatHistoryResponse,
  SessionsListResponse,
  SessionsDeleteBatchResponse,
  AcpEvent,
  ChatEventPayload,
  ChatSendParams,
} from '../../types/chat';

export interface MockWsClientOptions {
  onStatusChange?: (status: WsConnectionStatus) => void;
  onEvent?: (event: string, payload: unknown, seq?: number) => void;
  onGap?: (expectedSeq: number, receivedSeq: number) => void;
  requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface DemoSession {
  sessionKey: string;
  title: string;
  username: string;
  userId: string;
  messageCount: number;
  lastMessageAt: number;
  createdAt: number;
}

const DEMO_SESSIONS_KEY = 'demo-chat-sessions';
const DEMO_HISTORY_KEY = 'demo-chat-history';
const DEMO_USER_ID = 'demo-u-1';
const DEMO_USERNAME = 'demo-admin';

function getDemoSessions(): DemoSession[] {
  try {
    const raw = localStorage.getItem(DEMO_SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as DemoSession[]) : [];
  } catch {
    return [];
  }
}

function saveDemoSessions(sessions: DemoSession[]): void {
  try {
    localStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // ignore quota errors
  }
}

function getDemoHistory(sessionKey: string): AcpEvent[] {
  try {
    const all = JSON.parse(localStorage.getItem(DEMO_HISTORY_KEY) || '{}') as Record<string, AcpEvent[]>;
    return all[sessionKey] || [];
  } catch {
    return [];
  }
}

function saveDemoHistory(sessionKey: string, events: AcpEvent[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(DEMO_HISTORY_KEY) || '{}') as Record<string, AcpEvent[]>;
    all[sessionKey] = events;
    localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function appendHistory(sessionKey: string, event: AcpEvent): void {
  const history = getDemoHistory(sessionKey);
  history.push(event);
  saveDemoHistory(sessionKey, history);
}

function shortTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > 30 ? cleaned.slice(0, 30) : cleaned || '新对话';
}

export class MockWsClient {
  private reqId = 0;
  private pending = new Map<string, PendingRequest>();
  private lastSeq = 0;
  private status: WsConnectionStatus = 'disconnected';
  private abortedRuns = new Set<string>();
  /** runId -> sessionKey，用于事件流式时把事件追加到对应 session 的历史 */
  private activeRuns = new Map<string, string>();

  constructor(private options: MockWsClientOptions = {}) {}

  get connectionStatus(): WsConnectionStatus {
    return this.status;
  }

  connect(): void {
    this.setStatus('connecting');
    // 模拟 TCP 握手延迟
    setTimeout(() => {
      this.setStatus('connected');
      // 发送 hello-ok（无 seq，遵循真实 WsClient 行为）
      this.options.onEvent?.('hello-ok', {
        serverTime: Date.now(),
        mode: 'demo',
      });
    }, 120);
  }

  close(): void {
    this.setStatus('disconnected');
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Connection closed'));
    }
    this.pending.clear();
  }

  request<T = unknown>(method: string, params: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs ?? 15000;
      const id = `req-${++this.reqId}`;
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

      // 模拟网络延迟
      setTimeout(() => {
        this.handleRequest(method, params)
          .then((payload) => {
            const pending = this.pending.get(id);
            if (pending) pending.resolve(payload);
          })
          .catch((err: Error) => {
            const pending = this.pending.get(id);
            if (pending) pending.reject(err);
          });
      }, 30);
    });
  }

  private async handleRequest(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'sessions.list':
        return this.handleSessionsList();
      case 'sessions.deleteBatch':
        return this.handleSessionsDeleteBatch(params as { sessionKeys: string[] });
      case 'sessions.updateTitle':
        return this.handleSessionsUpdateTitle(params as { sessionKey: string; title: string });
      case 'chat.history':
        return this.handleChatHistory(params as { sessionKey: string });
      case 'chat.send':
        return this.handleChatSend(params as ChatSendParams);
      case 'chat.abort':
        return this.handleChatAbort(params as { runId: string });
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private handleSessionsList(): SessionsListResponse {
    return { sessions: getDemoSessions() };
  }

  private handleSessionsDeleteBatch(params: { sessionKeys: string[] }): SessionsDeleteBatchResponse {
    const keys = new Set(params.sessionKeys);
    const sessions = getDemoSessions().filter((s) => !keys.has(s.sessionKey));
    saveDemoSessions(sessions);
    // 清理对应历史
    try {
      const all = JSON.parse(localStorage.getItem(DEMO_HISTORY_KEY) || '{}') as Record<string, unknown>;
      for (const key of params.sessionKeys) delete all[key];
      localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
    return { deleted: params.sessionKeys.length };
  }

  private handleSessionsUpdateTitle(params: { sessionKey: string; title: string }): {
    sessionKey: string;
    title: string;
  } {
    const sessions = getDemoSessions().map((s) =>
      s.sessionKey === params.sessionKey ? { ...s, title: params.title } : s,
    );
    saveDemoSessions(sessions);
    return { sessionKey: params.sessionKey, title: params.title };
  }

  private handleChatHistory(params: { sessionKey: string }): ChatHistoryResponse {
    return {
      sessionKey: params.sessionKey,
      events: getDemoHistory(params.sessionKey),
      inFlightRun: null,
    };
  }

  private handleChatSend(params: ChatSendParams): ChatSendResponse {
    const runId = params.clientRunId || `run-demo-${Date.now()}`;
    this.activeRuns.set(runId, params.sessionKey);

    // 1. 持久化 user_message 事件
    const userEvent: AcpEvent = {
      seq: getDemoHistory(params.sessionKey).length + 1,
      timestamp: Date.now(),
      type: 'user_message',
      payload: { runId, message: params.message },
    };
    appendHistory(params.sessionKey, userEvent);

    // 2. 更新或创建 session 元信息
    const sessions = getDemoSessions();
    const existing = sessions.find((s) => s.sessionKey === params.sessionKey);
    const now = Date.now();
    if (existing) {
      const updated = sessions.map((s) =>
        s.sessionKey === params.sessionKey
          ? {
              ...s,
              title: s.title === '新对话' ? shortTitle(params.message) : s.title,
              lastMessageAt: now,
              messageCount: getDemoHistory(params.sessionKey).length,
            }
          : s,
      );
      saveDemoSessions(updated);
    } else {
      const newSession: DemoSession = {
        sessionKey: params.sessionKey,
        title: shortTitle(params.message),
        username: DEMO_USERNAME,
        userId: DEMO_USER_ID,
        messageCount: getDemoHistory(params.sessionKey).length,
        lastMessageAt: now,
        createdAt: now,
      };
      saveDemoSessions([newSession, ...sessions]);
    }

    // 3. 启动流式响应（异步）
    this.streamChatResponse(params, runId);

    return { runId, status: 'started' };
  }

  private handleChatAbort(params: { runId: string }): { runId: string; status: 'aborted' } {
    this.abortedRuns.add(params.runId);
    return { runId: params.runId, status: 'aborted' };
  }

  // ===== 流式响应生成 =====

  private streamChatResponse(params: ChatSendParams, runId: string): void {
    const mode = params.mode || 'plan';
    const enableThinking = params.enableThinking ?? true;

    // 1. 推理阶段
    const reasoningPromise = enableThinking
      ? this.streamReasoning(runId, mode, params.message)
      : Promise.resolve();

    // 2. 文本阶段（推理结束后开始）
    void reasoningPromise.then(() => {
      if (this.abortedRuns.has(runId)) {
        this.emitChatEvent(runId, { runId, type: 'aborted' });
        return;
      }
      this.streamText(runId, mode, params.message, () => {
        if (this.abortedRuns.has(runId)) {
          this.emitChatEvent(runId, { runId, type: 'aborted' });
          return;
        }
        // 3. 工具调用阶段（部分场景）
        const toolCalls = this.getToolCallsForMode(mode, params.message);
        if (toolCalls.length > 0) {
          this.streamToolCalls(runId, toolCalls, () => {
            this.emitDone(runId, params);
          });
        } else {
          this.emitDone(runId, params);
        }
      });
    });
  }

  private streamReasoning(runId: string, mode: string, message: string): Promise<void> {
    return new Promise((resolve) => {
      const reasoning = this.getReasoningForMode(mode, message);
      this.streamDeltas(runId, 'reasoning_delta', reasoning, 12, 20, resolve);
    });
  }

  private streamText(runId: string, mode: string, message: string, onComplete: () => void): void {
    const text = this.getTextForMode(mode, message);
    this.streamDeltas(runId, 'text_delta', text, 6, 25, onComplete);
  }

  private streamDeltas(
    runId: string,
    type: 'reasoning_delta' | 'text_delta',
    text: string,
    chunkSize: number,
    interval: number,
    onComplete: () => void,
  ): void {
    const chars = Array.from(text);
    let i = 0;

    const sendChunk = () => {
      if (this.abortedRuns.has(runId)) {
        onComplete();
        return;
      }
      if (i >= chars.length) {
        onComplete();
        return;
      }
      const chunk = chars.slice(i, i + chunkSize).join('');
      i += chunkSize;
      this.emitChatEvent(runId, { runId, type, delta: chunk } as ChatEventPayload);
      setTimeout(sendChunk, interval);
    };

    sendChunk();
  }

  private streamToolCalls(
    runId: string,
    toolCalls: Array<{ name: string; args: unknown; result: unknown }>,
    onComplete: () => void,
  ): void {
    let i = 0;
    const sendNext = () => {
      if (this.abortedRuns.has(runId) || i >= toolCalls.length) {
        onComplete();
        return;
      }
      const tc = toolCalls[i];
      const tcId = `tc-demo-${Date.now()}-${i}`;
      this.emitChatEvent(runId, {
        runId,
        type: 'tool_call',
        toolCall: { id: tcId, name: tc.name, arguments: tc.args },
      });
      setTimeout(() => {
        this.emitChatEvent(runId, {
          runId,
          type: 'tool_result',
          toolCallId: tcId,
          result: { name: tc.name, success: true, data: tc.result },
        });
        i++;
        setTimeout(sendNext, 350);
      }, 450);
    };
    sendNext();
  }

  private emitChatEvent(runId: string, payload: ChatEventPayload): void {
    this.lastSeq++;
    this.options.onEvent?.('chat', payload, this.lastSeq);
    // 同步持久化到历史
    const sessionKey = this.activeRuns.get(runId);
    if (sessionKey) {
      appendHistory(sessionKey, {
        seq: getDemoHistory(sessionKey).length + 1,
        timestamp: Date.now(),
        type: chatTypeToAcpType(payload.type),
        payload: chatPayloadToAcpPayload(payload),
      });
    }
  }

  private emitDone(runId: string, _params: ChatSendParams): void {
    if (this.abortedRuns.has(runId)) {
      this.emitChatEvent(runId, { runId, type: 'aborted' });
      this.activeRuns.delete(runId);
      return;
    }
    // 从历史中累计最终文本
    const sessionKey = this.activeRuns.get(runId);
    let finalText = '';
    if (sessionKey) {
      const history = getDemoHistory(sessionKey);
      finalText = history
        .filter((e) => e.type === 'assistant_delta')
        .map((e) => e.payload.delta || '')
        .join('');
    }
    this.emitChatEvent(runId, { runId, type: 'done', finalText });
    this.activeRuns.delete(runId);
    this.abortedRuns.delete(runId);
    // 更新会话元信息
    if (sessionKey) {
      const sessions = getDemoSessions();
      const updated = sessions.map((s) =>
        s.sessionKey === sessionKey
          ? { ...s, lastMessageAt: Date.now(), messageCount: getDemoHistory(sessionKey).length }
          : s,
      );
      saveDemoSessions(updated);
    }
  }

  // ===== 模式相关响应内容生成 =====

  private getReasoningForMode(mode: string, message: string): string {
    const isCost = /成本|费用|账单|cost|billing/i.test(message);
    const isRestart = /重启|启动|停止|restart|start|stop/i.test(message);
    const isAlert = /告警|警报|alert|alarm/i.test(message);
    const isList = /列出|查看|查询|list|show|get/i.test(message);

    if (mode === 'plan') {
      if (isCost) {
        return `用户询问云资源成本情况。这是一个只读分析任务，我需要：\n1. 先调用 get_cost_summary 获取各云厂商本月费用\n2. 调用 list_cloud_accounts 了解账户分布\n3. 识别成本异常和优化机会\n4. 生成结构化报告\n我不会执行任何写操作，符合 Plan 模式约束。`;
      }
      if (isAlert) {
        return `用户询问告警情况。我需要：\n1. 调用 list_alerts 获取活跃告警\n2. 按严重程度分组\n3. 关联到具体的资源\n4. 给出处置建议\n所有操作都是只读的。`;
      }
      if (isList) {
        return `用户想了解资源列表。我将：\n1. 调用 list_instances 获取 EC2/ECS 等计算资源\n2. 按 region 和 status 过滤\n3. 输出结构化结果\n不会执行任何变更操作。`;
      }
      return `分析用户问题：${message.slice(0, 50)}${message.length > 50 ? '...' : ''}\n我将先收集必要信息，然后给出分析建议。\n所有操作都是只读，不会修改任何资源。`;
    }

    if (mode === 'action') {
      if (isRestart) {
        return `用户要求重启实例。这是一个写操作，我将：\n1. 先获取目标实例信息\n2. 调用 restart_instance API\n3. 验证执行结果\n4. 反馈执行状态\nAction 模式下我会自动执行所有工具调用。`;
      }
      return `用户请求：${message.slice(0, 50)}${message.length > 50 ? '...' : ''}\n我将直接执行必要的操作，无需用户确认。\nAction 模式适用于自动化运维场景。`;
    }

    // confirm
    if (isRestart) {
      return `用户要求执行重启操作。这是高风险操作，需要用户确认。\n我将：\n1. 先列出受影响的实例\n2. 生成执行计划\n3. 等待用户明确批准后再执行\nConfirm 模式下所有写操作都需要人工审批。`;
    }
    return `用户请求：${message.slice(0, 50)}${message.length > 50 ? '...' : ''}\n我将先给出执行计划，等待用户确认后再执行任何写操作。`;
  }

  private getTextForMode(mode: string, message: string): string {
    const isCost = /成本|费用|账单|cost|billing/i.test(message);
    const isAlert = /告警|警报|alert|alarm/i.test(message);
    const isRestart = /重启|启动|停止|restart|start|stop/i.test(message);
    const isList = /列出|查看|查询|list|show|get/i.test(message);
    const isHelp = /帮助|help|你好|hello|hi\b/i.test(message);

    if (isHelp) {
      return `👋 你好！我是 CloudOps AI 助手（Demo 模式）。

我可以帮你：
• **查询资源**：查看 AWS、阿里云、Azure、腾讯云、华为云、Oracle、Render 的实例、存储、网络资源
• **成本分析**：按云厂商、region、服务类型拆解成本
• **告警管理**：查看活跃告警、严重程度、关联资源
• **运维操作**：重启实例、扩缩容（Plan/Action/Confirm 三种模式）

💡 **提示**：当前是 Demo 模式，所有响应都是本地模拟生成，不会连接真实云服务。切换顶部「Exit Demo」即可登录真实账户。`;
    }

    if (isCost) {
      if (mode === 'plan') {
        return `## 📊 本月云资源成本分析（只读模式）

| 云厂商 | 月度成本 (USD) | 实例数 | 单实例成本 |
|--------|---------------|--------|-----------|
| AWS    | $128,450     | 500    | $256.90   |
| 阿里云 | ¥312,000     | 300    | ¥1,040    |
| Azure  | $87,320      | 250    | $349.28   |
| 腾讯云 | ¥156,800     | 200    | ¥784      |
| 华为云 | ¥98,500      | 200    | ¥492.50   |
| Oracle | $42,180      | 150    | $281.20   |
| Render | $8,650       | 100    | $86.50    |

### 💡 关键发现

1. **AWS 占比最高**（约 38%），建议检查是否有闲置资源
2. **Azure 单实例成本偏高**，可能存在规格过大
3. **Render 资源利用率良好**，适合中小型 Web 服务

### 🎯 优化建议

- 停止 7 天以上未使用的开发环境实例
- 将 Azure D 系列降级为 B 系列（开发测试场景）
- 引入 Savings Plans 降低 AWS 长期承诺成本

📌 *Plan 模式未执行任何写操作，以上仅为分析建议。*`;
      }
      if (mode === 'action') {
        return `## ⚡ 正在自动执行成本优化...

已执行的操作：

1. ✅ 识别出 47 个低利用率实例（< 5% CPU 使用率持续 7 天）
2. ✅ 对开发环境实例生成停止计划
3. ✅ 发送通知到 SRE 团队 Slack 频道

预计节省：**$18,500/月**

⚡ *Action 模式：所有操作已自动执行，无需确认。*`;
      }
      // confirm
      return `## ✋ 待确认的成本优化操作

我已识别出可优化的资源，**执行以下操作需要你的确认**：

| 操作 | 影响范围 | 预计节省 |
|------|---------|---------|
| 停止 47 个低利用率开发实例 | dev/* 标签 | $12,300/月 |
| 降级 12 个 Azure B2s 实例 | 12 个实例 | $4,200/月 |
| 释放 8 个未挂载的 EBS 卷 | 8 个卷 | $2,000/月 |

📝 请在确认后继续。Confirm 模式下我不会自动执行任何写操作。`;
    }

    if (isAlert) {
      if (mode === 'plan') {
        return `## 🚨 活跃告警汇总（只读模式）

**严重程度分布**：
- 🔴 紧急 (Critical): 3
- 🟠 高 (High): 5
- 🟡 中 (Medium): 4
- 🟢 低 (Low): 3
**总计**: 15 个活跃告警

**Top 5 高优先级**：
1. AWS us-east-1 RDS 主库连接数 > 90% (Critical)
2. Azure 存储账户 eastus 延迟飙升 (High)
3. 阿里云 SLB 后端 ECS 健康检查失败 x3 (High)

📌 *Plan 模式：仅展示告警，未执行任何处置。*`;
      }
      if (mode === 'action') {
        return `## ⚡ 已自动处置告警

执行的自动恢复操作：
1. ✅ 横向扩容 RDS 只读副本 (+2)
2. ✅ 切换流量到健康 ALB 后端
3. ✅ 触发阿里云 SLB 健康检查重建

剩余告警：5 个（已抑制噪音告警）

⚡ *Action 模式：已自动处理 10/15 告警*`;
      }
      // confirm
      return `## ✋ 待确认的告警处置

检测到 3 个 Critical 告警需要立即处理：

1. **RDS 连接数饱和** - 建议扩容实例规格（影响 1 个生产库）
2. **SLB 后端异常** - 建议重启 3 个不健康 ECS（影响 api-prod 服务）
3. **存储账户延迟** - 建议切换到备区域（影响 us-east 数据同步）

请确认是否执行以上操作。`;
    }

    if (isList || isRestart) {
      if (mode === 'plan') {
        return `## 📋 实例查询结果

已获取 1700 个实例的元数据，覆盖 7 家云厂商。

**按状态分布**：
- 🟢 Running: 1020
- 🟡 Pending: 255
- ⚪ Stopped: 340
- 🔴 Error: 85

**按厂商分布**（前 3）：
- AWS: 500 (us-east-1 占 38%)
- 阿里云: 300 (cn-hangzhou 占 45%)
- Azure: 250 (eastus 占 42%)

📌 *Plan 模式：以上为只读分析，如需重启等写操作请切换到 Action 模式。*`;
      }
      if (mode === 'action') {
        return `## ⚡ 正在执行操作

1. ✅ 已定位目标实例
2. ✅ 触发 restart_instance API
3. ✅ 等待实例从 'stopping' → 'running'

预计完成时间：60 秒内

⚡ *Action 模式：已自动执行，无需确认。*`;
      }
      // confirm
      return `## ✋ 待确认操作

检测到 1 个目标实例需要重启：

- **实例 ID**: i-aws-0123
- **当前状态**: running
- **影响服务**: api-prod (SRE 团队)
- **预计停机时间**: 30 秒

请确认是否执行重启操作。`;
    }

    // 默认响应
    if (mode === 'plan') {
      return `## 📋 分析报告

我已分析你的问题："${message.slice(0, 60)}${message.length > 60 ? '...' : ''}"

**已收集的信息**：
- 7 家云厂商账户状态
- 1700+ 实例概览
- 15 个活跃告警
- 本月成本分布

**建议下一步**：
1. 细化查询条件（如指定 region 或标签）
2. 切换到 Action 模式执行具体操作
3. 切换到 Confirm 模式生成审批流

📌 *Plan 模式：仅提供分析建议，未执行写操作。*`;
    }
    if (mode === 'action') {
      return `## ⚡ 已执行

已根据你的请求执行了相应的查询/分析操作。

**执行摘要**：
- 调用了 list_instances / list_alerts / get_cost_summary 等只读 API
- 生成了结构化分析结果
- 无需用户确认

⚡ *Action 模式：操作已自动完成。*`;
    }
    // confirm
    return `## ✋ 待确认

我已准备好执行以下操作，但需要你明确批准：

1. 查询资源元数据
2. 生成分析报告
3. 记录到审计日志

📝 请确认后继续。`;
  }

  private getToolCallsForMode(_mode: string, _message: string): Array<{
    name: string;
    args: unknown;
    result: unknown;
  }> {
    // 简单模式：根据消息特征返回 1-2 个工具调用
    // 大多数消息不需要工具调用
    if (/列出|查看|查询|list|show/i.test(_message)) {
      return [
        {
          name: 'list_instances',
          args: { provider: 'all', status: 'running', limit: 10 },
          result: {
            total: 1020,
            sample: [
              { id: 'i-aws-0123', provider: 'aws', region: 'us-east-1', status: 'running' },
              { id: 'i-aws-0124', provider: 'aws', region: 'us-west-2', status: 'running' },
              { id: 'i-ali-0234', provider: 'aliyun', region: 'cn-hangzhou', status: 'running' },
            ],
          },
        },
      ];
    }
    if (/成本|费用|cost/i.test(_message)) {
      return [
        {
          name: 'get_cost_summary',
          args: { start: '2026-06-01', end: '2026-06-30' },
          result: {
            total: 487250,
            byProvider: {
              aws: 128450,
              aliyun: 87000,
              azure: 87320,
              tencent: 44000,
              huawei: 27650,
              oracle: 42180,
              render: 8650,
            },
          },
        },
      ];
    }
    if (/重启|restart/i.test(_message)) {
      return [
        {
          name: 'restart_instance',
          args: { instanceId: 'i-aws-0123' },
          result: { success: true, status: 'restarting', estimatedCompletion: 60 },
        },
      ];
    }
    return [];
  }

  private setStatus(status: WsConnectionStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}

// ===== 工具函数：ChatEventPayload -> AcpEvent =====

function chatTypeToAcpType(
  type: ChatEventPayload['type'],
): AcpEvent['type'] {
  switch (type) {
    case 'text_delta':
      return 'assistant_delta';
    case 'reasoning_delta':
      return 'assistant_reasoning';
    case 'tool_call':
      return 'tool_call';
    case 'tool_result':
      return 'tool_result';
    case 'done':
      return 'assistant_complete';
    case 'error':
      return 'error';
    default:
      return 'assistant_delta';
  }
}

function chatPayloadToAcpPayload(payload: ChatEventPayload): AcpEvent['payload'] {
  if (payload.type === 'text_delta') {
    return { runId: payload.runId, delta: payload.delta };
  }
  if (payload.type === 'reasoning_delta') {
    return { runId: payload.runId, delta: payload.delta };
  }
  if (payload.type === 'tool_call') {
    return { runId: payload.runId, toolCall: payload.toolCall };
  }
  if (payload.type === 'tool_result') {
    return { runId: payload.runId, result: payload.result, toolCallId: payload.toolCallId };
  }
  if (payload.type === 'done') {
    return { runId: payload.runId, finalText: payload.finalText };
  }
  if (payload.type === 'error') {
    return { runId: payload.runId, error: payload.error };
  }
  return { runId: payload.runId };
}
