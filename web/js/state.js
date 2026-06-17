class StateManager extends EventTarget {
  constructor() {
    super();
    this._state = {
      user: null,
      theme: localStorage.getItem('theme') || 'dark',
      currentPage: 'dashboard',
      notifications: [],
      sidebarCollapsed: false,
      skills: { list: [], loading: false },
      accounts: { list: [], loading: false },
      resources: { list: [], filter: 'all', loading: false },
      chat: { sessions: [], currentSession: null, messages: [], streaming: false },
      sync: { status: null, logs: [], loading: false },
      cost: { overview: null, trend: null, loading: false },
    };
  }

  get(key) {
    if (!key) return this._state;
    const keys = key.split('.');
    let value = this._state;
    for (const k of keys) {
      if (value === null || value === undefined) return undefined;
      value = value[k];
    }
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let target = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    const oldValue = target[keys[keys.length - 1]];
    target[keys[keys.length - 1]] = value;
    this.dispatchEvent(new CustomEvent(`state:${key}`, {
      detail: { key, value, oldValue }
    }));
  }

  batch(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.set(key, value);
    }
  }

  subscribe(key, callback) {
    const handler = (e) => callback(e.detail.value, e.detail.oldValue);
    this.addEventListener(`state:${key}`, handler);
    return () => this.removeEventListener(`state:${key}`, handler);
  }
}

const state = new StateManager();

state.subscribe('theme', (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
});

export default state;
