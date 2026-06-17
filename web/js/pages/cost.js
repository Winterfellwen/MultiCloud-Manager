import state from '../state.js';
import { costAPI } from '../api.js';
import { Toast } from '../components/toast.js';

export const costPage = {
  name: 'cost',

  init() {
    this.render();
    this.bindEvents();
    this.loadData();
  },

  render() {
    const page = document.getElementById('page-cost');
    if (!page) return;

    page.innerHTML = `
      <div class="section-title">Cost Analysis</div>
      <div class="cost-overview-cards">
        <div class="cost-card">
          <div class="cost-card-label">Current Month</div>
          <div class="cost-card-value" id="costCurrentMonth">-</div>
          <div class="cost-card-trend" id="costTrend"></div>
        </div>
        <div class="cost-card">
          <div class="cost-card-label">Last Month</div>
          <div class="cost-card-value" id="costLastMonth">-</div>
        </div>
        <div class="cost-card">
          <div class="cost-card-label">Forecast (30d)</div>
          <div class="cost-card-value" id="costForecast">-</div>
        </div>
        <div class="cost-card">
          <div class="cost-card-label">Potential Savings</div>
          <div class="cost-card-value" id="costSavings">-</div>
        </div>
      </div>

      <div class="cost-toolbar">
        <div class="cost-period-selector">
          <button class="period-btn active" data-period="7d">7 Days</button>
          <button class="period-btn" data-period="30d">30 Days</button>
          <button class="period-btn" data-period="90d">90 Days</button>
        </div>
        <button class="page-action-btn cost-refresh-btn">
          <svg width="14" height="14"><use href="/static/icons.svg#icon-refresh"/></svg>
          Refresh
        </button>
      </div>

      <div class="cost-charts">
        <div class="cost-chart-container">
          <div class="chart-header">
            <h3>Cost Trend</h3>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-dot" style="background:#007aff"></span>Daily Cost</span>
            </div>
          </div>
          <canvas id="costTrendChart" height="300"></canvas>
        </div>
        <div class="cost-chart-container">
          <div class="chart-header">
            <h3>Cost by Provider</h3>
          </div>
          <canvas id="costProviderChart" height="300"></canvas>
        </div>
      </div>

      <div class="cost-breakdown">
        <div class="chart-header">
          <h3>Cost Breakdown</h3>
        </div>
        <table class="cost-breakdown-table" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Provider</th>
              <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Amount</th>
              <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Percentage</th>
              <th style="text-align:left;padding:8px;font-size:12px;color:var(--text-muted);">Trend</th>
            </tr>
          </thead>
          <tbody id="costBreakdownBody"></tbody>
        </table>
      </div>

      <div class="cost-suggestions">
        <div class="chart-header">
          <h3>Optimization Suggestions</h3>
        </div>
        <div id="costSuggestionsList"></div>
      </div>
    `;

    this.currentMonthEl = page.querySelector('#costCurrentMonth');
    this.lastMonthEl = page.querySelector('#costLastMonth');
    this.forecastEl = page.querySelector('#costForecast');
    this.savingsEl = page.querySelector('#costSavings');
    this.trendEl = page.querySelector('#costTrend');
    this.breakdownBody = page.querySelector('#costBreakdownBody');
    this.suggestionsList = page.querySelector('#costSuggestionsList');
    this.trendChartCanvas = page.querySelector('#costTrendChart');
    this.providerChartCanvas = page.querySelector('#costProviderChart');
  },

  bindEvents() {
    // Period selector
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.set('cost.period', btn.dataset.period);
        this.loadData();
      });
    });

    // Refresh button
    document.querySelector('.cost-refresh-btn')?.addEventListener('click', () => {
      this.loadData();
    });
  },

  async loadData() {
    state.set('cost.loading', true);
    try {
      const [overview, trend, breakdown, suggestions] = await Promise.all([
        costAPI.overview(),
        costAPI.trend(),
        costAPI.breakdown(),
        costAPI.suggestions(),
      ]);

      state.set('cost.overview', overview);
      state.set('cost.trend', trend);
      state.set('cost.breakdown', breakdown);
      state.set('cost.suggestions', suggestions);

      this.renderOverview();
      this.renderCharts();
      this.renderBreakdown();
      this.renderSuggestions();
    } catch (err) {
      Toast.error(`加载成本数据失败: ${err.message}`);
    } finally {
      state.set('cost.loading', false);
    }
  },

  renderOverview() {
    const overview = state.get('cost.overview');
    if (!overview) return;

    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: overview.currency || 'USD',
      }).format(amount || 0);
    };

    this.currentMonthEl.textContent = formatCurrency(overview.current_month);
    this.lastMonthEl.textContent = formatCurrency(overview.last_month);
    this.forecastEl.textContent = formatCurrency(overview.forecast);
    this.savingsEl.textContent = formatCurrency(overview.potential_savings);

    // Trend
    if (overview.trend !== undefined) {
      const trendClass = overview.trend > 0 ? 'danger' : 'success';
      const trendSign = overview.trend > 0 ? '+' : '';
      this.trendEl.innerHTML = `<span class="badge badge-${trendClass}">${trendSign}${overview.trend.toFixed(1)}% vs last month</span>`;
    }
  },

  renderCharts() {
    const trend = state.get('cost.trend');
    const breakdown = state.get('cost.breakdown');

    // Cost Trend Chart
    if (this.trendChartCanvas && trend?.data) {
      this.renderTrendChart(trend.data);
    }

    // Provider Chart
    if (this.providerChartCanvas && breakdown?.by_provider) {
      this.renderProviderChart(breakdown.by_provider);
    }
  },

  renderTrendChart(data) {
    const ctx = this.trendChartCanvas.getContext('2d');

    // Destroy existing chart
    if (this.trendChart) {
      this.trendChart.destroy();
    }

    // Simple bar chart using canvas
    if (!data || data.length === 0) return;

    const maxValue = Math.max(...data.map(d => d.amount));
    const canvas = this.trendChartCanvas;
    const chartWidth = canvas.parentElement.clientWidth - 40;
    const chartHeight = 280;
    canvas.width = chartWidth;
    canvas.height = chartHeight;

    const barWidth = Math.min(40, (chartWidth - 60) / data.length - 4);
    const startX = 40;
    const startY = 20;
    const chartAreaHeight = chartHeight - startY - 40;

    ctx.clearRect(0, 0, chartWidth, chartHeight);

    // Y-axis
    ctx.strokeStyle = '#38383a';
    ctx.beginPath();
    ctx.moveTo(startX - 5, startY);
    ctx.lineTo(startX - 5, chartHeight - 30);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#a1a1a6';
    ctx.font = '11px var(--font-mono)';
    for (let i = 0; i <= 4; i++) {
      const y = startY + (chartAreaHeight / 4) * i;
      const value = maxValue * (1 - i / 4);
      ctx.fillText('$' + Math.round(value), 0, y + 4);
      ctx.beginPath();
      ctx.moveTo(startX - 5, y);
      ctx.lineTo(startX - 2, y);
      ctx.stroke();
    }

    // Bars
    data.forEach((d, i) => {
      const x = startX + i * (barWidth + 4);
      const barHeight = (d.amount / maxValue) * chartAreaHeight;
      const y = chartHeight - 30 - barHeight;

      // Gradient fill
      const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
      gradient.addColorStop(0, '#007aff');
      gradient.addColorStop(1, '#0056b3');
      ctx.fillStyle = gradient;

      ctx.fillRect(x, y, barWidth, barHeight);

      // X-axis label (show every 7th)
      if (i % Math.ceil(data.length / 7) === 0) {
        ctx.fillStyle = '#a1a1a6';
        ctx.font = '10px var(--font-mono)';
        ctx.fillText(d.date?.slice(5) || '', x, chartHeight - 10);
      }
    });
  },

  renderProviderChart(data) {
    const ctx = this.providerChartCanvas.getContext('2d');

    if (this.providerChart) {
      this.providerChart.destroy();
    }

    if (!data || data.length === 0) return;

    const canvas = this.providerChartCanvas;
    const chartWidth = canvas.parentElement.clientWidth - 40;
    const chartHeight = 280;
    canvas.width = chartWidth;
    canvas.height = chartHeight;

    const colors = {
      azure: '#0078d4',
      aws: '#ff9900',
      tencent: '#00a4ff',
      alicloud: '#ff6a00',
      oracle: '#f80000',
      render: '#46e3b7',
    };

    const total = data.reduce((sum, d) => sum + (d.amount || 0), 0);
    const centerX = chartWidth / 2;
    const centerY = chartHeight / 2;
    const radius = Math.min(centerX, centerY) - 60;

    ctx.clearRect(0, 0, chartWidth, chartHeight);

    let startAngle = -Math.PI / 2;

    data.forEach((d) => {
      const percentage = total > 0 ? (d.amount / total) * 100 : 0;
      const sliceAngle = (percentage / 100) * 2 * Math.PI;

      ctx.fillStyle = colors[d.provider?.toLowerCase()] || '#888';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();

      startAngle += sliceAngle;
    });

    // Legend
    const legendX = 20;
    const legendY = chartHeight - 20;
    ctx.font = '11px var(--font-mono)';

    let legendXPos = 20;
    data.forEach((d) => {
      const percentage = total > 0 ? ((d.amount / total) * 100).toFixed(1) : '0';
      ctx.fillStyle = colors[d.provider?.toLowerCase()] || '#888';
      ctx.fillRect(legendXPos, legendY - 10, 10, 10);
      ctx.fillStyle = '#c7c7cc';
      ctx.fillText(`${d.provider} (${percentage}%)`, legendXPos + 15, legendY);
      legendXPos += 100;
    });
  },

  renderBreakdown() {
    const breakdown = state.get('cost.breakdown');
    if (!breakdown || !breakdown.by_provider) return;

    const total = breakdown.by_provider.reduce((sum, d) => sum + (d.amount || 0), 0);

    this.breakdownBody.innerHTML = breakdown.by_provider.map(d => {
      const percentage = total > 0 ? ((d.amount / total) * 100).toFixed(1) : '0';
      const trendClass = (d.trend || 0) > 0 ? 'danger' : 'success';
      return `
        <tr>
          <td style="padding:10px 8px;">${d.provider}</td>
          <td style="padding:10px 8px;">$${d.amount?.toFixed(2) || '0.00'}</td>
          <td style="padding:10px 8px;">${percentage}%</td>
          <td style="padding:10px 8px;">
            <span class="badge badge-${trendClass}">${d.trend > 0 ? '+' : ''}${d.trend?.toFixed(1) || '0'}%</span>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderSuggestions() {
    const suggestions = state.get('cost.suggestions');
    if (!suggestions || !suggestions.suggestions) return;

    if (suggestions.suggestions.length === 0) {
      this.suggestionsList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No suggestions available</div>';
      return;
    }

    this.suggestionsList.innerHTML = suggestions.suggestions.map(s => `
      <div class="suggestion-card">
        <div class="suggestion-header">
          <span class="suggestion-title">${s.title || 'Optimization'}</span>
          <span class="badge badge-${s.severity === 'high' ? 'danger' : s.severity === 'medium' ? 'warning' : 'success'}">${s.severity || 'low'}</span>
        </div>
        <div class="suggestion-description">${s.description || ''}</div>
        <div class="suggestion-meta">
          <span>Potential savings: $${s.potential_savings?.toFixed(2) || '0.00'}</span>
          <span>Confidence: ${s.confidence ? (s.confidence * 100).toFixed(0) : '0'}%</span>
        </div>
      </div>
    `).join('');
  },

  destroy() {
    if (this.trendChart) {
      this.trendChart.destroy();
    }
    if (this.providerChart) {
      this.providerChart.destroy();
    }
  }
};
