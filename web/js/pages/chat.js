import state from '../state.js';
import { chatAPI } from '../api.js';
import { Toast } from '../components/toast.js';
import { parseMarkdown, parseTable } from '../utils/markdown.js';

export const chatPage = {
  name: 'chat',

  init() {
    this.render();
    this.bindEvents();
    this.loadSessions();
  },

  render() {
    const page = document.getElementById('page-chat');
    if (!page) return;

    // Initialize chat page structure
    page.innerHTML = `
      <div class="chat-container">
        <div class="chat-sidebar">
          <div class="chat-sidebar-header">
            <button class="btn btn-sm btn-primary new-chat-btn">
              <svg width="14" height="14"><use href="/static/icons.svg#icon-plus"/></svg>
              New Chat
            </button>
          </div>
          <div class="chat-sessions-list"></div>
        </div>
        <div class="chat-main">
          <div class="chat-messages" id="chatMessages"></div>
          <div class="chat-input-area">
            <textarea class="chat-input" id="chatInput" placeholder="Type your message... (Shift+Enter for newline, Enter to send)"></textarea>
            <button class="chat-send-btn" id="chatSendBtn">
              <svg width="18" height="18"><use href="/static/icons.svg#icon-send"/></svg>
            </button>
            <button class="chat-stop-btn" id="chatStopBtn" style="display:none;">
              <svg width="18" height="18"><use href="/static/icons.svg#icon-stop"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    this.messagesContainer = page.querySelector('#chatMessages');
    this.inputEl = page.querySelector('#chatInput');
    this.sendBtn = page.querySelector('#chatSendBtn');
    this.stopBtn = page.querySelector('#chatStopBtn');
    this.sessionsList = page.querySelector('.chat-sessions-list');
    this.newChatBtn = page.querySelector('.new-chat-btn');
  },

  bindEvents() {
    // Send message
    this.sendBtn?.addEventListener('click', () => this.sendMessage());

    // Enter to send, Shift+Enter for newline
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Stop generation
    this.stopBtn?.addEventListener('click', () => this.stopGeneration());

    // New chat
    this.newChatBtn?.addEventListener('click', () => this.createNewSession());

    // Auto-resize textarea
    this.inputEl?.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 200) + 'px';
    });
  },

  async loadSessions() {
    try {
      const data = await chatAPI.sessions();
      state.set('chat.sessions', data.sessions || []);
      this.renderSessions();
    } catch (err) {
      Toast.error(`加载会话失败: ${err.message}`);
    }
  },

  renderSessions() {
    const sessions = state.get('chat.sessions') || [];
    const currentId = state.get('chat.currentSession')?.id;

    if (!this.sessionsList) return;

    if (sessions.length === 0) {
      this.sessionsList.innerHTML = '<div class="chat-sessions-empty">No sessions yet</div>';
      return;
    }

    this.sessionsList.innerHTML = sessions.map(s => `
      <div class="chat-session-item ${s.id === currentId ? 'active' : ''}" data-id="${s.id}">
        <span class="chat-session-title">${s.title || 'New Chat'}</span>
        <button class="chat-session-delete" data-id="${s.id}">
          <svg width="12" height="12"><use href="/static/icons.svg#icon-trash"/></svg>
        </button>
      </div>
    `).join('');

    // Bind click events
    this.sessionsList.querySelectorAll('.chat-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.chat-session-delete')) return;
        this.selectSession(item.dataset.id);
      });
    });

    this.sessionsList.querySelectorAll('.chat-session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(btn.dataset.id);
      });
    });
  },

  async selectSession(sessionId) {
    try {
      const data = await chatAPI.getSession(sessionId);
      state.set('chat.currentSession', data.session);
      state.set('chat.messages', data.messages || []);
      this.renderMessages();
      this.renderSessions();
    } catch (err) {
      Toast.error(`加载会话失败: ${err.message}`);
    }
  },

  async createNewSession() {
    try {
      const data = await chatAPI.createSession({ title: 'New Chat' });
      state.set('chat.currentSession', data.session);
      state.set('chat.messages', []);
      this.renderMessages();
      this.renderSessions();
    } catch (err) {
      Toast.error(`创建会话失败: ${err.message}`);
    }
  },

  async deleteSession(sessionId) {
    try {
      await chatAPI.deleteSession(sessionId);
      Toast.success('会话已删除');
      if (state.get('chat.currentSession')?.id === sessionId) {
        state.set('chat.currentSession', null);
        state.set('chat.messages', []);
        this.renderMessages();
      }
      this.loadSessions();
    } catch (err) {
      Toast.error(`删除会话失败: ${err.message}`);
    }
  },

  renderMessages() {
    const messages = state.get('chat.messages') || [];
    const currentSession = state.get('chat.currentSession');

    if (!this.messagesContainer) return;

    if (!currentSession) {
      this.messagesContainer.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon">💬</div>
          <div class="chat-empty-text">Start a new conversation</div>
        </div>
      `;
      return;
    }

    if (messages.length === 0) {
      this.messagesContainer.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-text">Ask me anything about your cloud resources, costs, or any technical question!</div>
        </div>
      `;
      return;
    }

    this.messagesContainer.innerHTML = messages.map(msg => this.renderMessage(msg)).join('');

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  },

  renderMessage(msg) {
    const isUser = msg.role === 'user';
    const content = isUser ? escapeHtml(msg.content) : this.renderAssistantContent(msg.content);

    return `
      <div class="chat-message ${isUser ? 'user' : 'assistant'}">
        <div class="chat-message-avatar">${isUser ? 'U' : 'AI'}</div>
        <div class="chat-message-content">${content}</div>
      </div>
    `;
  },

  renderAssistantContent(content) {
    if (!content) return '';

    // Check for tables
    if (content.includes('|') && content.includes('---')) {
      content = parseTable(content);
    } else {
      content = parseMarkdown(content);
    }

    return content;
  },

  async sendMessage() {
    const message = this.inputEl?.value.trim();
    if (!message) return;

    const session = state.get('chat.currentSession');
    if (!session) {
      await this.createNewSession();
    }

    const currentSession = state.get('chat.currentSession');
    if (!currentSession) return;

    // Add user message to state
    const messages = [...(state.get('chat.messages') || []), {
      role: 'user',
      content: message,
    }];
    state.set('chat.messages', messages);

    // Clear input
    if (this.inputEl) {
      this.inputEl.value = '';
      this.inputEl.style.height = 'auto';
    }

    // Render user message immediately
    this.renderMessages();

    // Show streaming state
    state.set('chat.streaming', true);
    this.showStreamingState();

    try {
      // Start SSE stream
      await this.streamMessage(currentSession.id, message, messages);
    } catch (err) {
      Toast.error(`发送消息失败: ${err.message}`);
      state.set('chat.streaming', false);
      this.hideStreamingState();
    }
  },

  showStreamingState() {
    if (this.sendBtn) this.sendBtn.style.display = 'none';
    if (this.stopBtn) this.stopBtn.style.display = 'block';
  },

  hideStreamingState() {
    if (this.sendBtn) this.sendBtn.style.display = 'block';
    if (this.stopBtn) this.stopBtn.style.display = 'none';
  },

  async streamMessage(sessionId, message, priorMessages) {
    const messages = priorMessages;

    // Create assistant message placeholder
    let assistantContent = '';
    const assistantMsg = {
      role: 'assistant',
      content: '',
    };
    messages.push(assistantMsg);

    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(
        `${window.location.origin}/api/agent/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}`
      );

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.type === 'content') {
            assistantContent += data.content;
            assistantMsg.content = assistantContent;
            state.set('chat.messages', [...messages]);
            this.renderMessages();
          } else if (data.type === 'done') {
            eventSource.close();
            state.set('chat.streaming', false);
            this.hideStreamingState();
            this.loadSessions();
            resolve();
          } else if (data.type === 'error') {
            eventSource.close();
            state.set('chat.streaming', false);
            this.hideStreamingState();
            reject(new Error(data.message || 'Stream error'));
          }
        } catch (err) {
          // Ignore parse errors for partial messages
        }
      };

      eventSource.onerror = (e) => {
        eventSource.close();
        state.set('chat.streaming', false);
        this.hideStreamingState();
        reject(new Error('Connection error'));
      };
    });
  },

  stopGeneration() {
    // TODO: Implement stop generation via API
    state.set('chat.streaming', false);
    this.hideStreamingState();
    Toast.info('Generation stopped');
  },

  destroy() {
    // Cleanup if needed
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
