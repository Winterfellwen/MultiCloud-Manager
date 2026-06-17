import state from '../state.js';
import { skillsAPI } from '../api.js';
import { Toast } from '../components/toast.js';

export const skillsPage = {
  name: 'skills',

  init() {
    this.render();
    this.bindEvents();
    this.loadSkills();
  },

  render() {
    const page = document.getElementById('page-skills');
    if (!page) return;

    page.innerHTML = `
      <div class="skills-container">
        <div class="skills-header">
          <div class="skills-search">
            <svg width="16" height="16"><use href="/static/icons.svg#icon-search"/></svg>
            <input type="text" id="skillSearch" placeholder="Search skills..." />
          </div>
          <div class="skills-filter">
            <button class="filter-btn active" data-filter="all">All</button>
            <button class="filter-btn" data-filter="enabled">Enabled</button>
            <button class="filter-btn" data-filter="disabled">Disabled</button>
          </div>
        </div>
        <div class="skills-grid" id="skillsGrid"></div>
      </div>
    `;

    this.grid = page.querySelector('#skillsGrid');
    this.searchInput = page.querySelector('#skillSearch');
    this.filterBtns = page.querySelectorAll('.filter-btn');
  },

  bindEvents() {
    this.searchInput?.addEventListener('input', () => this.filterSkills());

    this.filterBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterSkills();
      });
    });
  },

  async loadSkills() {
    try {
      const data = await skillsAPI.listAll();
      state.set('skills.all', data.skills || []);
      this.renderSkills(data.skills || []);
    } catch (err) {
      Toast.error(`Failed to load skills: ${err.message}`);
    }
  },

  renderSkills(skills) {
    if (!this.grid) return;

    if (skills.length === 0) {
      this.grid.innerHTML = '<div class="skills-empty">No skills found</div>';
      return;
    }

    this.grid.innerHTML = skills.map(skill => this.renderSkillCard(skill)).join('');

    // Bind toggle events
    this.grid.querySelectorAll('.skill-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.currentTarget.dataset.name;
        const enabled = e.currentTarget.dataset.enabled === 'true';
        this.toggleSkill(name, !enabled);
      });
    });

    // Bind config events
    this.grid.querySelectorAll('.skill-config-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.currentTarget.dataset.name;
        this.openConfigModal(name);
      });
    });
  },

  renderSkillCard(skill) {
    const statusClass = skill.enabled ? 'enabled' : 'disabled';
    const statusText = skill.enabled ? 'Enabled' : 'Disabled';
    const toggleText = skill.enabled ? 'Disable' : 'Enable';

    // Build tags from triggers
    const tags = (skill.triggers || []).flatMap(t => t.keywords || []).slice(0, 5);
    const tagsHtml = tags.map(tag => `<span class="skill-tag">${escapeHtml(tag)}</span>`).join('');

    // Tools count
    const toolsCount = (skill.tools || []).length;

    return `
      <div class="skill-card ${statusClass}" data-name="${escapeHtml(skill.name)}">
        <div class="skill-card-header">
          <div class="skill-icon">${skill.name.charAt(0).toUpperCase()}</div>
          <div class="skill-status-badge ${statusClass}">${statusText}</div>
        </div>
        <div class="skill-card-body">
          <h3 class="skill-name">${escapeHtml(skill.name)}</h3>
          <p class="skill-description">${escapeHtml(skill.description || 'No description')}</p>
          <div class="skill-tags">${tagsHtml}</div>
        </div>
        <div class="skill-card-footer">
          <div class="skill-meta">
            <span class="skill-tools" title="${toolsCount} tools">
              <svg width="14" height="14"><use href="/static/icons.svg#icon-tools"/></svg>
              ${toolsCount}
            </span>
            <span class="skill-config-count" title="${(skill.config || []).length} config params">
              <svg width="14" height="14"><use href="/static/icons.svg#icon-settings"/></svg>
              ${(skill.config || []).length}
            </span>
          </div>
          <div class="skill-actions">
            ${skill.config?.length > 0 ? `
              <button class="skill-config-btn" data-name="${escapeHtml(skill.name)}">
                <svg width="14" height="14"><use href="/static/icons.svg#icon-settings"/></svg>
              </button>
            ` : ''}
            <button class="skill-toggle ${skill.enabled ? 'disable' : 'enable'}" 
                    data-name="${escapeHtml(skill.name)}" 
                    data-enabled="${skill.enabled}">
              ${toggleText}
            </button>
          </div>
        </div>
      </div>
    `;
  },

  filterSkills() {
    const query = this.searchInput?.value.toLowerCase() || '';
    const filter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    const skills = state.get('skills.all') || [];

    const filtered = skills.filter(skill => {
      const matchesSearch = !query ||
        skill.name.toLowerCase().includes(query) ||
        (skill.description || '').toLowerCase().includes(query) ||
        (skill.triggers || []).some(t => (t.keywords || []).some(k => k.toLowerCase().includes(query)));

      const matchesFilter = filter === 'all' ||
        (filter === 'enabled' && skill.enabled) ||
        (filter === 'disabled' && !skill.enabled);

      return matchesSearch && matchesFilter;
    });

    this.renderSkills(filtered);
  },

  async toggleSkill(name, enable) {
    try {
      if (enable) {
        await skillsAPI.enable(name);
        Toast.success(`Skill "${name}" enabled`);
      } else {
        await skillsAPI.disable(name);
        Toast.info(`Skill "${name}" disabled`);
      }
      this.loadSkills();
    } catch (err) {
      Toast.error(`Failed to toggle skill: ${err.message}`);
    }
  },

  openConfigModal(name) {
    const skills = state.get('skills.all') || [];
    const skill = skills.find(s => s.name === name);
    if (!skill || !skill.config?.length) return;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Configure: ${escapeHtml(skill.name)}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="skillConfigForm">
            ${skill.config.map(param => this.renderConfigField(param, skill.config_values)).join('')}
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="saveSkillConfig">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind events
    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-cancel')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector('#saveSkillConfig')?.addEventListener('click', async () => {
      const form = modal.querySelector('#skillConfigForm');
      const config = {};
      form.querySelectorAll('[data-config-name]').forEach(field => {
        const name = field.dataset.configName;
        const type = field.dataset.configType;
        let value = field.value;
        if (type === 'number') value = parseFloat(value);
        if (type === 'boolean') value = field.checked;
        config[name] = value;
      });

      try {
        await skillsAPI.updateConfig(skill.name, config);
        Toast.success('Configuration saved');
        modal.remove();
        this.loadSkills();
      } catch (err) {
        Toast.error(`Failed to save config: ${err.message}`);
      }
    });
  },

  renderConfigField(param, values) {
    const currentValue = values?.[param.name] ?? param.default ?? '';

    let inputHtml;
    switch (param.type) {
      case 'boolean':
        inputHtml = `
          <label class="config-toggle">
            <input type="checkbox" data-config-name="${escapeHtml(param.name)}" 
                   data-config-type="boolean" ${currentValue ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        `;
        break;
      case 'number':
        inputHtml = `
          <input type="number" data-config-name="${escapeHtml(param.name)}" 
                 data-config-type="number" value="${currentValue}" />
        `;
        break;
      default:
        inputHtml = `
          <input type="text" data-config-name="${escapeHtml(param.name)}" 
                 data-config-type="string" value="${escapeHtml(String(currentValue))}" />
        `;
    }

    return `
      <div class="config-field">
        <label class="config-label">
          ${escapeHtml(param.name)}
          ${param.description ? `<span class="config-desc">${escapeHtml(param.description)}</span>` : ''}
        </label>
        ${inputHtml}
      </div>
    `;
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
