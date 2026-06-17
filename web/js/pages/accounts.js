import state from '../state.js';
import { accountsAPI } from '../api.js';
import { Toast } from '../components/toast.js';
import { Modal } from '../components/modal.js';

export const accountsPage = {
  name: 'accounts',

  init() {
    this.render();
    this.bindEvents();
    this.loadData();
  },

  render() {
    const page = document.getElementById('page-accounts');
    if (!page) return;
    this.tableBody = page.querySelector('.accounts-table tbody');
    this.loadingEl = page.querySelector('.accounts-loading');
    this.emptyEl = page.querySelector('.accounts-empty');
  },

  bindEvents() {
    document.querySelector('.accounts-refresh-btn')?.addEventListener('click', () => {
      this.loadData();
    });

    document.querySelector('.accounts-add-btn')?.addEventListener('click', () => {
      this.showAddModal();
    });

    this.tableBody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'sync':
          this.syncAccount(id);
          break;
        case 'edit':
          this.editAccount(id);
          break;
        case 'delete':
          this.deleteAccount(id);
          break;
      }
    });
  },

  async loadData() {
    state.set('accounts.loading', true);
    try {
      const data = await accountsAPI.list();
      state.set('accounts.list', data.accounts || []);
      this.renderTable();
    } catch (err) {
      Toast.error(`加载账户失败: ${err.message}`);
    } finally {
      state.set('accounts.loading', false);
    }
  },

  renderTable() {
    const accounts = state.get('accounts.list');

    if (!accounts || accounts.length === 0) {
      this.tableBody.innerHTML = '';
      this.emptyEl?.classList.remove('hidden');
      return;
    }

    this.emptyEl?.classList.add('hidden');
    this.tableBody.innerHTML = accounts.map(acc => `
      <tr data-id="${acc.id}">
        <td>${acc.provider}</td>
        <td>${acc.account_id}</td>
        <td>${acc.name}</td>
        <td>${acc.regions?.join(', ') || '-'}</td>
        <td><span class="badge badge-${acc.status === 'active' ? 'success' : 'warning'}">${acc.status}</span></td>
        <td>${acc.last_sync ? new Date(acc.last_sync).toLocaleString() : '从未'}</td>
        <td>
          <button class="btn btn-sm btn-icon" data-action="sync" data-id="${acc.id}" title="同步">
            <svg><use href="/static/icons.svg#icon-refresh"></use></svg>
          </button>
          <button class="btn btn-sm btn-icon" data-action="edit" data-id="${acc.id}" title="编辑">
            <svg><use href="/static/icons.svg#icon-edit"></use></svg>
          </button>
          <button class="btn btn-sm btn-icon btn-danger" data-action="delete" data-id="${acc.id}" title="删除">
            <svg><use href="/static/icons.svg#icon-trash"></use></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  async syncAccount(id) {
    try {
      await accountsAPI.sync(id);
      Toast.success('同步已启动');
      this.loadData();
    } catch (err) {
      Toast.error(`同步失败: ${err.message}`);
    }
  },

  async deleteAccount(id) {
    const confirmed = await Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      confirmText: '删除',
      cancelText: '取消',
    });

    if (!confirmed) return;

    try {
      await accountsAPI.delete(id);
      Toast.success('账户已删除');
      this.loadData();
    } catch (err) {
      Toast.error(`删除失败: ${err.message}`);
    }
  },

  showAddModal() {
    Toast.info('添加账户功能开发中');
  },

  editAccount(id) {
    Toast.info('编辑账户功能开发中');
  },

  destroy() {
    // Cleanup event listeners if needed
  }
};
