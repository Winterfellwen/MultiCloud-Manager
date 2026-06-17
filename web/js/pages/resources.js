import state from '../state.js';
import { resourcesAPI } from '../api.js';
import { Toast } from '../components/toast.js';
import { Modal } from '../components/modal.js';

export const resourcesPage = {
  name: 'resources',

  init() {
    this.render();
    this.bindEvents();
    this.loadData();
  },

  render() {
    const page = document.getElementById('page-resources');
    if (!page) return;

    // Page structure
    page.innerHTML = `
      <div class="section-title">Cloud Resources</div>
      <div class="resources-toolbar">
        <div class="resources-filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="compute">Compute</button>
          <button class="filter-btn" data-filter="storage">Storage</button>
          <button class="filter-btn" data-filter="network">Network</button>
          <button class="filter-btn" data-filter="database">Database</button>
        </div>
        <div class="resources-actions" style="display:none;">
          <span class="selected-count">0 selected</span>
          <button class="btn btn-sm btn-primary batch-action-btn" data-action="start" disabled>Start</button>
          <button class="btn btn-btn-sm btn-warning batch-action-btn" data-action="stop" disabled>Stop</button>
          <button class="btn btn-sm btn-danger batch-action-btn" data-action="restart" disabled>Restart</button>
        </div>
        <div style="margin-left:auto;">
          <button class="page-action-btn resources-refresh-btn">
            <svg width="14" height="14"><use href="/static/icons.svg#icon-refresh"/></svg>
            Refresh
          </button>
          <button class="page-action-btn resources-sync-btn">
            <svg width="14" height="14"><use href="/static/icons.svg#icon-sync"/></svg>
            Sync
          </button>
        </div>
      </div>
      <div class="resources-search">
        <input type="text" class="search-input" id="resourceSearch" placeholder="Search resources...">
      </div>
      <table class="resources-table" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="text-align:left;padding:8px;">
              <input type="checkbox" id="selectAllResources">
            </th>
            <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Provider</th>
            <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Type</th>
            <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Name</th>
            <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Region</th>
            <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Status</th>
            <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <div class="resources-empty" style="display:none;padding:40px;text-align:center;color:var(--text-muted);">
        No resources found
      </div>
    `;

    this.tableBody = page.querySelector('.resources-table tbody');
    this.emptyEl = page.querySelector('.resources-empty');
    this.toolbar = page.querySelector('.resources-actions');
    this.selectedCount = page.querySelector('.selected-count');
    this.searchInput = page.querySelector('#resourceSearch');
    this.selectAllCheckbox = page.querySelector('#selectAllResources');
  },

  bindEvents() {
    // Refresh button
    document.querySelector('.resources-refresh-btn')?.addEventListener('click', () => this.loadData());

    // Sync button
    document.querySelector('.resources-sync-btn')?.addEventListener('click', () => this.syncResources());

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.set('resources.filter', btn.dataset.filter);
        this.renderTable();
      });
    });

    // Search input
    this.searchInput?.addEventListener('input', (e) => {
      state.set('resources.search', e.target.value);
      this.renderTable();
    });

    // Select all checkbox
    this.selectAllCheckbox?.addEventListener('change', (e) => {
      const checkboxes = this.tableBody?.querySelectorAll('input[type="checkbox"]');
      checkboxes?.forEach(cb => {
        cb.checked = e.target.checked;
      });
      this.updateSelectedCount();
    });

    // Batch action buttons
    document.querySelectorAll('.batch-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.performBatchAction(btn.dataset.action);
      });
    });

    // Table row clicks
    this.tableBody?.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        this.updateSelectedCount();
      }
    });

    this.tableBody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'start':
        case 'stop':
        case 'restart':
          this.performSingleAction(id, action);
          break;
      }
    });
  },

  async loadData() {
    state.set('resources.loading', true);
    try {
      const data = await resourcesAPI.list();
      state.set('resources.list', data.resources || []);
      this.renderTable();
    } catch (err) {
      Toast.error(`加载资源失败: ${err.message}`);
    } finally {
      state.set('resources.loading', false);
    }
  },

  renderTable() {
    let resources = state.get('resources.list') || [];
    const filter = state.get('resources.filter') || 'all';
    const search = state.get('resources.search') || '';

    // Apply filter
    if (filter !== 'all') {
      resources = resources.filter(r => {
        const type = (r.type || '').toLowerCase();
        switch (filter) {
          case 'compute': return type.includes('vm') || type.includes('instance') || type.includes('compute') || type.includes('ecs');
          case 'storage': return type.includes('volume') || type.includes('disk') || type.includes('storage') || type.includes('bucket');
          case 'network': return type.includes('network') || type.includes('vpc') || type.includes('subnet') || type.includes('loadbalancer');
          case 'database': return type.includes('database') || type.includes('db') || type.includes('redis') || type.includes('mysql');
          default: return true;
        }
      });
    }

    // Apply search
    if (search) {
      const searchLower = search.toLowerCase();
      resources = resources.filter(r =>
        (r.name || '').toLowerCase().includes(searchLower) ||
        (r.type || '').toLowerCase().includes(searchLower) ||
        (r.provider || '').toLowerCase().includes(searchLower) ||
        (r.region || '').toLowerCase().includes(searchLower)
      );
    }

    if (!this.tableBody) return;

    if (resources.length === 0) {
      this.tableBody.innerHTML = '';
      this.emptyEl?.classList.remove('hidden');
      return;
    }

    this.emptyEl?.classList.add('hidden');
    this.tableBody.innerHTML = resources.map(r => `
      <tr data-id="${r.id}">
        <td style="padding:8px;"><input type="checkbox" class="resource-checkbox" value="${r.id}"></td>
        <td>${this.providerIcon(r.provider)} ${r.provider}</td>
        <td>${r.type}</td>
        <td>${r.name}</td>
        <td>${r.region || '-'}</td>
        <td><span class="badge badge-${this.statusColor(r.status)}">${r.status || 'unknown'}</span></td>
        <td>
          ${this.canAction(r.type) ? `
            <button class="btn btn-sm btn-icon" data-action="start" data-id="${r.id}" title="Start">
              <svg width="14" height="14"><use href="/static/icons.svg#icon-play"/></svg>
            </button>
            <button class="btn btn-sm btn-icon" data-action="stop" data-id="${r.id}" title="Stop">
              <svg width="14" height="14"><use href="/static/icons.svg#icon-stop"/></svg>
            </button>
            <button class="btn btn-sm btn-icon" data-action="restart" data-id="${r.id}" title="Restart">
              <svg width="14" height="14"><use href="/static/icons.svg#icon-refresh"/></svg>
            </button>
          ` : '-'}
        </td>
      </tr>
    `).join('');
  },

  providerIcon(provider) {
    const icons = {
      azure: '☁️',
      aws: '🟠',
      tencent: '🔵',
      alicloud: '🟠',
      oracle: '🔴',
      render: '🟢',
    };
    return icons[provider?.toLowerCase()] || '☁️';
  },

  statusColor(status) {
    const s = (status || '').toLowerCase();
    if (s === 'running' || s === 'active') return 'success';
    if (s === 'stopped' || s === 'stopped') return 'warning';
    if (s === 'error' || s === 'failed') return 'danger';
    return 'secondary';
  },

  canAction(type) {
    if (!type) return false;
    const t = type.toLowerCase();
    return t.includes('vm') || t.includes('instance') || t.includes('compute') || t.includes('ecs') || t.includes('ec2');
  },

  updateSelectedCount() {
    const checked = this.tableBody?.querySelectorAll('input[type="checkbox"]:checked') || [];
    const count = checked.length;
    this.selectedCount.textContent = `${count} selected`;
    this.toolbar.style.display = count > 0 ? 'flex' : 'none';
    document.querySelectorAll('.batch-action-btn').forEach(btn => {
      btn.disabled = count === 0;
    });
  },

  getSelectedIds() {
    const checked = this.tableBody?.querySelectorAll('input[type="checkbox"]:checked') || [];
    return Array.from(checked).map(cb => cb.value);
  },

  async performSingleAction(id, action) {
    const confirmed = await Modal.confirm({
      title: `确认 ${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}?`,
      content: `确定要对资源执行 ${action} 操作吗？`,
      confirmText: '确认',
      cancelText: '取消',
    });

    if (!confirmed) return;

    try {
      await resourcesAPI.action(id, action);
      Toast.success(`操作已启动`);
      this.loadData();
    } catch (err) {
      Toast.error(`操作失败: ${err.message}`);
    }
  },

  async performBatchAction(action) {
    const ids = this.getSelectedIds();
    if (ids.length === 0) return;

    const actionNames = { start: '启动', stop: '停止', restart: '重启' };
    const confirmed = await Modal.confirm({
      title: `批量 ${actionNames[action]}?`,
      content: `确定要对 ${ids.length} 个资源执行 ${actionNames[action]} 操作吗？`,
      confirmText: '确认',
      cancelText: '取消',
    });

    if (!confirmed) return;

    try {
      const result = await resourcesAPI.batchAction(ids, action);
      if (result.errors && Object.keys(result.errors).length > 0) {
        Toast.warning(result.summary);
      } else {
        Toast.success(result.summary);
      }
      this.loadData();
    } catch (err) {
      Toast.error(`批量操作失败: ${err.message}`);
    }
  },

  async syncResources() {
    Toast.info('同步已启动...');
    try {
      await resourcesAPI.list(); // Trigger sync via existing API
      Toast.success('同步完成');
      this.loadData();
    } catch (err) {
      Toast.error(`同步失败: ${err.message}`);
    }
  },

  destroy() {
    // Cleanup if needed
  }
};
