const API = require('../../utils/api')
const i18n = require('../../utils/i18n')

Page({
  data: {
    messages: [],
    inputValue: '',
    sessionId: '',
    isTyping: false,
    currentPlan: null,
    executionMode: 'risk_review',
    executionModeLabel: '',
    executionModes: [],
    theme: 'dark',
    showConfig: false,
    showQuickActions: false,
    aiProvider: '',
    aiModel: '',
    aiApiKey: '',
    aiTemperature: '0.7'
  },

  onLoad() {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('chat.title') })
    this.createNewSession()
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'chat.title', 'chat.thinking', 'chat.placeholder', 'chat.send',
      'chat.exec_plan', 'chat.confirm_title', 'chat.request_failed',
      'chat.exec_failed', 'chat.confirm_content',
      'chat.exec_step', 'chat.step_progress', 'chat.step_done', 'chat.exec_complete',
      'chat.config_title', 'chat.config_provider', 'chat.config_model',
      'chat.config_temperature', 'chat.config_api_key',
      'chat.config_placeholder_provider', 'chat.config_placeholder_model',
      'chat.config_save', 'chat.config_saved',
      'chat.quick_actions', 'chat.new_session', 'chat.clear'
    ])})
    var modes = [
      { label: i18n.t('chat.mode_plan'), value: 'plan_only' },
      { label: i18n.t('chat.mode_confirm'), value: 'step_confirm' },
      { label: i18n.t('chat.mode_review'), value: 'risk_review' },
      { label: i18n.t('chat.mode_auto'), value: 'auto_execute' }
    ]
    var currentMode = this.data.executionMode || 'risk_review'
    var found = modes.find(function(m) { return m.value === currentMode })
    this.setData({
      executionModes: modes,
      executionModeLabel: found ? found.label : currentMode
    })
  },

  createNewSession() {
    var self = this
    var sessionId = 'sess_' + Date.now()
    this.setData({ sessionId: sessionId, messages: [] })
    API.post('/agent/sessions', {}).then(function(data) {
      self.setData({ sessionId: data.session_id || data.id || sessionId })
    }).catch(function(err) { console.error('Session creation failed:', err) })
  },

  sendMessage() {
    var content = this.data.inputValue.trim()
    if (!content) return
    var userMsg = { role: 'user', content: content }
    var messages = [].concat(this.data.messages).concat([userMsg])
    this.setData({ messages: messages, inputValue: '', isTyping: true })
    API.post('/agent/chat', {
      session_id: this.data.sessionId,
      message: content
    })
      .then(function(response) {
        var assistantMsg = {
          role: 'assistant',
          content: response.message,
          plan: response.plan,
          risk_summary: response.risk_summary
        }
        var updatedMessages = [].concat(messages).concat([assistantMsg])
        this.setData({
          messages: updatedMessages,
          isTyping: false,
          currentPlan: response.plan
        })
      }.bind(this))
      .catch(function(err) {
        console.error('Agent chat error:', err)
        this.setData({ isTyping: false })
        wx.showToast({ title: i18n.t('chat.request_failed'), icon: 'none' })
      }.bind(this))
  },

  executePlan() {
    if (!this.data.currentPlan) return
    var content = i18n.t('chat.confirm_content', {
      title: this.data.currentPlan.title,
      mode: this.getModeLabel(this.data.executionMode)
    })
    wx.showModal({
      title: i18n.t('chat.confirm_title'),
      content: content,
      success: function(res) {
        if (res.confirm) this.startExecution()
      }.bind(this)
    })
  },

  startExecution() {
    API.post('/agent/execute', {
      session_id: this.data.sessionId,
      plan_id: this.data.currentPlan.id,
      mode: this.data.executionMode
    })
      .then(function(response) {
        this.addSystemMessage('执行已触发 (ID: ' + response.execution_id + ')')
        this.listenToExecution(response.execution_id)
      }.bind(this))
      .catch(function(err) {
        wx.showToast({ title: i18n.t('chat.exec_failed'), icon: 'none' })
      })
  },

  listenToExecution(executionId) {
    this._stopPoll = API.poll('/agent/executions/' + executionId, 2000,
      function(data) { this.handleExecutionUpdate(data) }.bind(this),
      function(err) { console.error('Poll error:', err) }
    )
  },

  handleExecutionUpdate(data) {
    var event = data.event, step = data.step, percent = data.percent, message = data.message, result = data.result
    var content
    if (event === 'step_start') {
      content = i18n.t('chat.exec_step', { step: step, msg: message })
    } else if (event === 'step_progress') {
      content = i18n.t('chat.step_progress', { step: step, percent: percent, msg: message })
    } else if (event === 'step_complete') {
      content = i18n.t('chat.step_done', { step: step, result: result })
    } else if (event === 'done') {
      content = i18n.t('chat.exec_complete', { summary: data.summary })
    } else {
      content = '[' + (event || data.status) + '] ' + (data.message || '')
    }
    if (content) this.addSystemMessage(content)
  },

  onUnload() {
    if (this._stopPoll) this._stopPoll()
  },

  addSystemMessage(content) {
    var systemMsg = { role: 'system', content: content }
    var messages = [].concat(this.data.messages).concat([systemMsg])
    this.setData({ messages: messages })
  },

  noop() {},

  onInputChange(e) {
    this.setData({ inputValue: e.detail.value })
  },

  onModeChange(e) {
    var mode = e.detail.value
    var found = this.data.executionModes.find(function(m) { return m.value === mode })
    this.setData({ 
      executionMode: mode,
      executionModeLabel: found ? found.label : mode
    })
  },

  toggleQuickActions() {
    this.setData({ showQuickActions: !this.data.showQuickActions })
  },

  openConfig() {
    var saved = wx.getStorageSync('ai_config') || {}
    this.setData({
      showConfig: true,
      aiProvider: saved.provider || '',
      aiModel: saved.model || '',
      aiApiKey: saved.api_key || '',
      aiTemperature: String(saved.temperature || '0.7')
    })
  },

  closeConfig() {
    this.setData({ showConfig: false })
  },

  onConfigInput(e) {
    var field = e.currentTarget.dataset.field
    var obj = {}
    obj[field] = e.detail.value
    this.setData(obj)
  },

  saveConfig() {
    wx.setStorageSync('ai_config', {
      provider: this.data.aiProvider,
      model: this.data.aiModel,
      api_key: this.data.aiApiKey,
      temperature: parseFloat(this.data.aiTemperature) || 0.7
    })
    this.setData({ showConfig: false })
    wx.showToast({ title: i18n.t('chat.config_saved'), icon: 'success' })
  },

  clearChat() {
    this.setData({ messages: [] })
  },

  newSession() {
    this.setData({ messages: [], sessionId: '' })
    this.createNewSession()
  }
})
