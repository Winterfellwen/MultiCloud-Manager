import state from '../state.js';
import { api } from '../api.js';
import { Toast } from '../components/toast.js';
import { Modal } from '../components/modal.js';

const terraformAPI = {
  list: () => api.get('/terraform/templates'),
  get: (id) => api.get(`/terraform/templates/${id}`),
  create: (data) => api.post('/terraform/templates', data),
  update: (id, data) => api.post(`/terraform/templates/${id}`, data),
  delete: (id) => api.delete(`/terraform/templates/${id}`),
  plan: (id) => api.post(`/terraform/templates/${id}/plan`),
  apply: (id) => api.post(`/terraform/templates/${id}/apply`),
  destroy: (id) => api.post(`/terraform/templates/${id}/destroy`),
};

export const terraformPage = {
  name: 'terraform',

  init() {
    this.render();
    this.bindEvents();
    this.loadTemplates();
  },

  render() {
    const page = document.getElementById('page-terraform');
    if (!page) return;

    page.innerHTML = `
      <div class="section-title">Terraform Templates</div>
      <div class="tf-toolbar">
        <button class="btn btn-primary tf-create-btn">
          <svg width="14" height="14"><use href="/static/icons.svg#icon-plus"/></svg>
          New Template
        </button>
      </div>
      <div class="tf-templates-grid" id="tfTemplatesGrid">
        <div class="tf-loading">Loading templates...</div>
      </div>
    `;

    this.grid = page.querySelector('#tfTemplatesGrid');
    this.createBtn = page.querySelector('.tf-create-btn');
  },

  bindEvents() {
    this.createBtn?.addEventListener('click', () => this.showCreateModal());
  },

  async loadTemplates() {
    try {
      const data = await terraformAPI.list();
      this.renderTemplates(data.templates || []);
    } catch (err) {
      Toast.error(`加载模板失败: ${err.message}`);
      this.grid.innerHTML = '<div class="tf-empty">Failed to load templates</div>';
    }
  },

  renderTemplates(templates) {
    if (templates.length === 0) {
      this.grid.innerHTML = '<div class="tf-empty">No templates yet. Create your first template!</div>';
      return;
    }

    this.grid.innerHTML = templates.map(t => `
      <div class="tf-template-card" data-id="${t.id}">
        <div class="tf-template-header">
          <div class="tf-template-name">${t.name}</div>
          <span class="badge badge-${this.statusColor(t.status)}">${t.status || 'draft'}</span>
        </div>
        <div class="tf-template-meta">
          <span>Version: ${t.version || '1.0'}</span>
          ${t.last_applied_at ? `<span>Last applied: ${new Date(t.last_applied_at).toLocaleDateString()}</span>` : ''}
        </div>
        <div class="tf-template-actions">
          <button class="btn btn-sm btn-icon tf-action-btn" data-action="edit" data-id="${t.id}" title="Edit">
            <svg width="14" height="14"><use href="/static/icons.svg#icon-edit"/></svg>
          </button>
          <button class="btn btn-sm btn-icon tf-action-btn" data-action="plan" data-id="${t.id}" title="Plan">
            <svg width="14" height="14"><use href="/static/icons.svg#icon-play"/></svg>
          </button>
          <button class="btn btn-sm btn-icon tf-action-btn" data-action="apply" data-id="${t.id}" title="Apply">
            <svg width="14" height="14"><use href="/static/icons.svg#icon-check"/></svg>
          </button>
          <button class="btn btn-sm btn-icon tf-action-btn tf-destroy-btn" data-action="destroy" data-id="${t.id}" title="Destroy">
            <svg width="14" height="14"><use href="/static/icons.svg#icon-trash"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Bind events
    this.grid.querySelectorAll('.tf-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        this.handleAction(action, id);
      });
    });
  },

  statusColor(status) {
    switch (status) {
      case 'applied': return 'success';
      case 'planned': return 'info';
      case 'draft': return 'secondary';
      case 'destroyed': return 'danger';
      default: return 'secondary';
    }
  },

  handleAction(action, id) {
    switch (action) {
      case 'edit':
        this.showEditModal(id);
        break;
      case 'plan':
        this.executeAction(id, 'plan', 'Plan');
        break;
      case 'apply':
        this.executeAction(id, 'apply', 'Apply');
        break;
      case 'destroy':
        this.confirmDestroy(id);
        break;
    }
  },

  async executeAction(id, action, label) {
    try {
      const apiMethod = action === 'plan' ? terraformAPI.plan : action === 'apply' ? terraformAPI.apply : terraformAPI.destroy;
      await apiMethod(id);
      Toast.success(`${label} executed successfully`);
      this.loadTemplates();
    } catch (err) {
      Toast.error(`${label} failed: ${err.message}`);
    }
  },

  async confirmDestroy(id) {
    const confirmed = await Modal.confirm({
      title: 'Confirm Destroy',
      content: 'This will destroy all resources created by this template. This action cannot be undone.',
      confirmText: 'Destroy',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      this.executeAction(id, 'destroy', 'Destroy');
    }
  },

  showCreateModal() {
    Toast.info('Create template - feature coming soon');
  },

  showEditModal(id) {
    Toast.info('Edit template - feature coming soon');
  },

  destroy() {
    // Cleanup if needed
  }
};
