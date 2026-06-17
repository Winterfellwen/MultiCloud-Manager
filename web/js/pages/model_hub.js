import state from '../state.js';
import { modelHubAPI } from '../api.js';
import { Toast } from '../components/toast.js';

export const modelHubPage = {
  name: 'model_hub',

  init() {
    this.render();
    this.bindEvents();
    this.loadData();
  },

  render() {
    const page = document.getElementById('page-model_hub');
    if (!page) return;

    page.innerHTML = `
      <div class="model-hub-container">
        <div class="model-hub-header">
          <h2>AI Model Hub</h2>
          <p class="model-hub-subtitle">Configure AI providers and models for cloud management</p>
        </div>
        <div class="model-hub-content">
          <div class="providers-grid" id="providersGrid"></div>
          <div class="model-config-panel" id="configPanel"></div>
        </div>
      </div>
    `;

    this.providersGrid = page.querySelector('#providersGrid');
    this.configPanel = page.querySelector('#configPanel');
  },

  bindEvents() {
    // Events bound dynamically after render
  },

  async loadData() {
    try {
      const [providersRes, configRes] = await Promise.all([
        modelHubAPI.listProviders(),
        modelHubAPI.getConfig(),
      ]);

      state.set('modelHub.providers', providersRes.providers || []);
      state.set('modelHub.config', configRes);
      this.renderProviders(providersRes.providers || [], configRes);
    } catch (err) {
      Toast.error(`Failed to load model hub: ${err.message}`);
    }
  },

  renderProviders(providers, currentConfig) {
    if (!this.providersGrid) return;

    this.providersGrid.innerHTML = providers.map(provider => {
      const isActive = currentConfig.provider_id === provider.id;
      return `
        <div class="provider-card ${isActive ? 'active' : ''}" data-provider="${escapeHtml(provider.id)}">
          <div class="provider-header">
            <div class="provider-icon">${provider.name.charAt(0)}</div>
            <div class="provider-info">
              <h4 class="provider-name">${escapeHtml(provider.name)}</h4>
              <span class="provider-endpoint">${escapeHtml(provider.endpoint)}</span>
            </div>
            ${isActive ? '<span class="provider-badge">Active</span>' : ''}
          </div>
          <div class="provider-models">
            ${provider.models.map(m => `<span class="model-chip ${isActive && currentConfig.model === m ? 'selected' : ''}">${escapeHtml(m)}</span>`).join('')}
          </div>
          <div class="provider-actions">
            <button class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-primary'} provider-select-btn" 
                    data-provider="${escapeHtml(provider.id)}">
              ${isActive ? 'Configured' : 'Select'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind provider selection
    this.providersGrid.querySelectorAll('.provider-select-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const providerId = e.currentTarget.dataset.provider;
        this.selectProvider(providerId);
      });
    });

    // Render config panel for active provider
    if (currentConfig.provider_id) {
      const activeProvider = providers.find(p => p.id === currentConfig.provider_id);
      if (activeProvider) {
        this.renderConfigPanel(activeProvider, currentConfig);
      }
    }
  },

  selectProvider(providerId) {
    const providers = state.get('modelHub.providers') || [];
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Default to first model
    const defaultModel = provider.models[0] || '';
    const config = {
      provider_id: provider.id,
      model: defaultModel,
      endpoint: provider.endpoint,
      api_key: '',
    };

    state.set('modelHub.selectedProvider', provider);
    this.renderProviders(providers, config);
    this.renderConfigPanel(provider, config);
  },

  renderConfigPanel(provider, config) {
    if (!this.configPanel) return;

    const isCustom = provider.id === 'custom';

    this.configPanel.innerHTML = `
      <div class="config-panel">
        <h3>Configuration: ${escapeHtml(provider.name)}</h3>
        <form id="modelHubForm">
          <div class="config-field">
            <label>Model</label>
            ${isCustom
              ? `<input type="text" id="modelInput" value="${escapeHtml(config.model || '')}" placeholder="e.g. gpt-4o" />`
              : `<select id="modelInput">${provider.models.map(m =>
                  `<option value="${escapeHtml(m)}" ${config.model === m ? 'selected' : ''}>${escapeHtml(m)}</option>`
                ).join('')}</select>`
            }
          </div>
          <div class="config-field">
            <label>API Endpoint</label>
            <input type="text" id="endpointInput" value="${escapeHtml(config.endpoint || provider.endpoint)}" 
                   ${!isCustom ? 'readonly' : ''} />
          </div>
          <div class="config-field">
            <label>API Key</label>
            <input type="password" id="apiKeyInput" value="${config.api_key ? '****' : ''}" placeholder="Enter API key" />
            <span class="field-hint">Your API key is stored securely and never exposed in the UI</span>
          </div>
          <div class="config-actions">
            <button type="button" class="btn btn-secondary" id="testConnectionBtn">
              Test Connection
            </button>
            <button type="submit" class="btn btn-primary">Save Configuration</button>
          </div>
        </form>
      </div>
    `;

    // Bind form submit
    this.configPanel.querySelector('#modelHubForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveConfig(provider);
    });

    // Bind test connection
    this.configPanel.querySelector('#testConnectionBtn')?.addEventListener('click', () => {
      this.testConnection();
    });
  },

  async saveConfig(provider) {
    const model = this.configPanel.querySelector('#modelInput')?.value || '';
    const endpoint = this.configPanel.querySelector('#endpointInput')?.value || '';
    const apiKey = this.configPanel.querySelector('#apiKeyInput')?.value || '';

    const config = {
      provider_id: provider.id,
      model,
      endpoint,
      api_key: apiKey,
    };

    try {
      await modelHubAPI.updateConfig(config);
      Toast.success('Model configuration saved');
      state.set('modelHub.config', config);
      this.loadData();
    } catch (err) {
      Toast.error(`Failed to save: ${err.message}`);
    }
  },

  async testConnection() {
    // Use legacy test endpoint
    try {
      const { api } = await import('../api.js');
      const res = await api.post('/agent/config/test');
      Toast.success(`Connection successful! Reply: ${res.reply || 'OK'}`);
    } catch (err) {
      Toast.error(`Connection failed: ${err.message}`);
    }
  },

  destroy() {
    // Cleanup
  }
};

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
