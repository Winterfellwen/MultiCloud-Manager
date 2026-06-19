// <cloudops-chat> Lit 组件（重写，参考 OpenClaw views/chat.ts 结构）
// 功能：会话列表 + 消息流 + 流式渲染 + 工具卡片 + 输入框 + 中止 + 连接状态 + 断线恢复
import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { GatewayClient } from './gateway-client';
import { ChatController } from './chat-controller';
import type { ChatMessage, ChatSession, WsConnectionStatus } from './types';
import './styles/base.css';

const STATUS_TEXT: Record<WsConnectionStatus, string> = {
  disconnected: '未连接',
  connecting: '连接中...',
  connected: '已连接',
  reconnecting: '重连中...',
  error: '连接错误',
};

const STATUS_COLOR: Record<WsConnectionStatus, string> = {
  disconnected: '#8b8b94',
  connecting: '#f59e0b',
  connected: '#22c55e',
  reconnecting: '#f59e0b',
  error: '#ef4444',
};

@customElement('cloudops-chat')
export class CloudOpsChat extends LitElement {
  @property() gatewayUrl = '';
  @property() token = '';

  @state() private connectionStatus: WsConnectionStatus = 'disconnected';
  @state() private sessions: ChatSession[] = [];
  @state() private currentSessionKey: string | null = null;
  @state() private messages: ChatMessage[] = [];
  @state() private inputText = '';
  @state() private isSending = false;

  private client: GatewayClient | null = null;
  private controller: ChatController | null = null;
  private messagesEndRef: HTMLElement | null = null;
  private expandedTools = new Set<string>();

  static styles = [
    css`
      :host {
        display: flex;
        height: 100%;
        width: 100%;
        font-family: var(--font-sans);
        color: var(--text);
        background: var(--bg);
        font-size: 14px;
        overflow: hidden;
      }

      * {
        box-sizing: border-box;
      }

      /* 会话列表侧边栏 */
      .sidebar {
        width: 240px;
        shrink: 0;
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        background: var(--bg-accent);
      }

      .sidebar-header {
        padding: 12px;
        border-bottom: 1px solid var(--border);
      }

      .new-chat-btn {
        width: 100%;
        padding: 8px 12px;
        background: var(--primary);
        color: var(--primary-foreground);
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
        justify-content: center;
      }

      .new-chat-btn:hover {
        background: var(--accent-hover);
      }

      .session-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }

      .session-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 13px;
      }

      .session-item:hover {
        background: var(--bg-hover);
      }

      .session-item.active {
        background: var(--bg-muted);
      }

      .session-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* 对话区 */
      .chat-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .status-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-bottom: 1px solid var(--border);
        font-size: 12px;
        color: var(--muted);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px 0;
      }

      .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--muted);
        font-size: 14px;
      }

      .message {
        display: flex;
        gap: 12px;
        padding: 12px 16px;
      }

      .message.user {
        flex-direction: row-reverse;
      }

      .avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        shrink: 0;
        font-size: 14px;
      }

      .avatar.user {
        background: var(--primary);
        color: var(--primary-foreground);
      }

      .avatar.assistant {
        background: var(--bg-muted);
        color: var(--muted);
      }

      .message-content {
        max-width: 80%;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .message.user .message-content {
        align-items: flex-end;
      }

      .bubble {
        padding: 8px 12px;
        border-radius: var(--radius-lg);
        font-size: 14px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .bubble.user {
        background: var(--primary);
        color: var(--primary-foreground);
      }

      .bubble.assistant {
        background: var(--bg-muted);
        color: var(--text);
      }

      .cursor {
        display: inline-block;
        width: 6px;
        height: 14px;
        margin-left: 2px;
        background: currentColor;
        animation: blink 1s infinite;
        vertical-align: middle;
      }

      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }

      .error-text {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--destructive);
      }

      /* 工具卡片 */
      .tool-card {
        margin: 8px 0;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg-accent);
        font-size: 13px;
      }

      .tool-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        cursor: pointer;
        text-align: left;
        width: 100%;
        background: none;
        border: none;
        color: var(--text);
        font-size: 13px;
      }

      .tool-header:hover {
        background: var(--bg-hover);
      }

      .tool-name {
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 500;
      }

      .tool-status {
        margin-left: auto;
        font-size: 12px;
      }

      .tool-status.completed {
        color: var(--ok);
      }

      .tool-status.pending {
        color: var(--muted);
      }

      .tool-body {
        padding: 8px 12px;
        border-top: 1px solid var(--border);
      }

      .tool-section {
        margin-bottom: 8px;
      }

      .tool-section-label {
        font-size: 11px;
        color: var(--muted);
        margin-bottom: 4px;
      }

      .tool-code {
        background: var(--bg);
        padding: 8px;
        border-radius: var(--radius-sm);
        font-family: var(--font-mono);
        font-size: 12px;
        overflow-x: auto;
        max-height: 240px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* 输入区 */
      .input-area {
        border-top: 1px solid var(--border);
        padding: 12px;
        background: var(--bg-accent);
        display: flex;
        align-items: flex-end;
        gap: 8px;
      }

      .input-textarea {
        flex: 1;
        resize: none;
        border: 1px solid var(--input);
        background: var(--bg);
        color: var(--text);
        padding: 8px 12px;
        border-radius: var(--radius);
        font-size: 14px;
        font-family: var(--font-sans);
        min-height: 40px;
        max-height: 128px;
        outline: none;
      }

      .input-textarea:focus {
        border-color: var(--ring);
      }

      .send-btn {
        padding: 8px 16px;
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .send-btn.send {
        background: var(--primary);
        color: var(--primary-foreground);
      }

      .send-btn.send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .send-btn.abort {
        background: var(--destructive);
        color: var(--destructive-foreground);
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    this.initClient();
  }

  disconnectedCallback(): void {
    this.client?.close();
    super.disconnectedCallback();
  }

  updated(changedProps: PropertyValues): void {
    if ((changedProps.has('gatewayUrl') || changedProps.has('token')) && this.token) {
      this.initClient();
    }
  }

  private initClient(): void {
    if (!this.gatewayUrl || !this.token) return;
    if (this.client) return;

    this.client = new GatewayClient({
      url: this.gatewayUrl,
      token: this.token,
      onStatusChange: (status) => {
        this.connectionStatus = status;
      },
      onGap: () => {
        // seq gap 检测，触发历史恢复
        if (this.currentSessionKey) {
          this.controller?.loadSessionHistory(this.currentSessionKey);
        }
      },
    });

    this.controller = new ChatController({
      client: this.client,
      onMessagesChange: (_sessionKey, messages) => {
        if (_sessionKey === this.currentSessionKey) {
          this.messages = [...messages];
          this.scrollToBottom();
        }
      },
      onSessionsChange: (sessions) => {
        this.sessions = [...sessions];
      },
      onSendingChange: (sending) => {
        this.isSending = sending;
      },
    });

    this.client.connect();
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  private handleNewSession(): void {
    this.controller?.createSession();
  }

  private handleSelectSession(sessionKey: string): void {
    this.currentSessionKey = sessionKey;
    this.controller?.selectSession(sessionKey);
  }

  private handleInput(e: Event): void {
    this.inputText = (e.target as HTMLTextAreaElement).value;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  private handleSend(): void {
    if (!this.inputText.trim() || this.isSending) return;
    this.controller?.sendMessage(this.inputText);
    this.inputText = '';
  }

  private handleAbort(): void {
    const runId = this.controller?.getCurrentRunId();
    if (runId) {
      this.controller?.abortRun(runId);
    }
  }

  private toggleTool(toolId: string): void {
    if (this.expandedTools.has(toolId)) {
      this.expandedTools.delete(toolId);
    } else {
      this.expandedTools.add(toolId);
    }
    this.requestUpdate();
  }

  private renderMessage(msg: ChatMessage): unknown {
    const isUser = msg.role === 'user';
    const isStreaming = msg.status === 'streaming';
    const isError = msg.status === 'error';

    return html`
      <div class="message ${msg.role}">
        <div class="avatar ${msg.role}">
          ${isUser ? 'U' : 'AI'}
        </div>
        <div class="message-content">
          ${msg.toolCalls.length > 0
            ? html`${msg.toolCalls.map((tc) => this.renderToolCard(tc))}`
            : null}
          ${msg.content
            ? html`<div class="bubble ${msg.role}">
                ${msg.content}${isStreaming
                  ? html`<span class="cursor"></span>`
                  : null}
              </div>`
            : null}
          ${isError
            ? html`<div class="error-text">${msg.error || '生成失败'}</div>`
            : null}
        </div>
      </div>
    `;
  }

  private renderToolCard(tc: { id: string; name: string; args: unknown; result?: { name: string; content: unknown }; status: string }): unknown {
    const expanded = this.expandedTools.has(tc.id);
    return html`
      <div class="tool-card">
        <button class="tool-header" @click=${() => this.toggleTool(tc.id)}>
          <span>${expanded ? '▼' : '▶'}</span>
          <span class="tool-name">${tc.name}</span>
          <span class="tool-status ${tc.status}">
            ${tc.status === 'completed' ? '✓' : '...'}
          </span>
        </button>
        ${expanded
          ? html`<div class="tool-body">
              ${tc.args != null
                ? html`<div class="tool-section">
                    <div class="tool-section-label">参数</div>
                    <pre class="tool-code">${typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args, null, 2)}</pre>
                  </div>`
                : null}
              ${tc.result
                ? html`<div class="tool-section">
                    <div class="tool-section-label">结果</div>
                    <pre class="tool-code">${typeof tc.result.content === 'string' ? tc.result.content : JSON.stringify(tc.result.content, null, 2)}</pre>
                  </div>`
                : null}
            </div>`
          : null}
      </div>
    `;
  }

  render(): unknown {
    return html`
      <div class="sidebar">
        <div class="sidebar-header">
          <button class="new-chat-btn" @click=${this.handleNewSession}>
            + 新建对话
          </button>
        </div>
        <div class="session-list">
          ${this.sessions.length === 0
            ? html`<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 12px;">暂无对话</div>`
            : this.sessions.map(
                (s) => html`
                  <div
                    class="session-item ${s.sessionKey === this.currentSessionKey ? 'active' : ''}"
                    @click=${() => this.handleSelectSession(s.sessionKey)}
                  >
                    <span class="session-title">${s.title}</span>
                    <span style="font-size: 11px; color: var(--muted);">${s.messageCount}</span>
                  </div>
                `
              )}
        </div>
      </div>

      <div class="chat-area">
        <div class="status-bar">
          <span class="status-dot" style="background: ${STATUS_COLOR[this.connectionStatus]}"></span>
          <span>${STATUS_TEXT[this.connectionStatus]}</span>
        </div>

        <div class="messages-container">
          ${this.messages.length === 0
            ? html`<div class="empty-state">开始新的对话</div>`
            : this.messages.map((msg) => this.renderMessage(msg))}
          <div id="messages-end" ${((el: HTMLElement) => (this.messagesEndRef = el)) as unknown}></div>
        </div>

        ${this.currentSessionKey
          ? html`<div class="input-area">
              <textarea
                class="input-textarea"
                .value=${this.inputText}
                @input=${this.handleInput}
                @keydown=${this.handleKeyDown}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                rows="1"
              ></textarea>
              ${this.isSending
                ? html`<button class="send-btn abort" @click=${this.handleAbort}>中止</button>`
                : html`<button
                    class="send-btn send"
                    @click=${this.handleSend}
                    ?disabled=${!this.inputText.trim()}
                  >发送</button>`}
            </div>`
          : null}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cloudops-chat': CloudOpsChat;
  }
}
