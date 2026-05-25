// pages/agent/chat.js - AI Agent 对话页面
const API = require('../../utils/api')

Page({
  data: {
    messages: [],
    inputValue: '',
    sessionId: '',
    isTyping: false,
    currentPlan: null,
    executionMode: 'risk_review', // plan_only/step_confirm/risk_review/auto_execute
    executionModes: [
      { label: '仅生成方案', value: 'plan_only' },
      { label: '分步确认', value: 'step_confirm' },
      { label: '风险审查模式', value: 'risk_review' },
      { label: '全自动执行', value: 'auto_execute' }
    ]
  },

  onLoad() {
    this.createNewSession()
  },

  // 创建新会话
  createNewSession() {
    const sessionId = 'sess_' + Date.now()
    this.setData({ sessionId, messages: [] })
  },

  // 发送消息
  sendMessage() {
    const content = this.data.inputValue.trim()
    if (!content) return

    // 添加用户消息
    const userMsg = { role: 'user', content }
    const messages = [...this.data.messages, userMsg]
    this.setData({ 
      messages, 
      inputValue: '',
      isTyping: true 
    })

    // 发送到 AI Agent
    API.post('/agent/chat', {
      session_id: this.data.sessionId,
      message: content
    })
      .then(response => {
        const assistantMsg = { 
          role: 'assistant', 
          content: response.message,
          plan: response.plan,
          risk_summary: response.risk_summary
        }
        
        const updatedMessages = [...messages, assistantMsg]
        this.setData({ 
          messages: updatedMessages,
          isTyping: false,
          currentPlan: response.plan
        })
      })
      .catch(err => {
        console.error('Agent chat error:', err)
        this.setData({ isTyping: false })
        wx.showToast({ title: '请求失败', icon: 'error' })
      })
  },

  // 执行计划
  executePlan() {
    if (!this.data.currentPlan) return

    wx.showModal({
      title: '确认执行',
      content: `将执行计划: ${this.data.currentPlan.title}\n执行模式: ${this.getModeLabel(this.data.executionMode)}`,
      success: (res) => {
        if (res.confirm) {
          this.startExecution()
        }
      }
    })
  },

  // 开始执行
  startExecution() {
    API.post('/agent/execute', {
      session_id: this.data.sessionId,
      plan_id: this.data.currentPlan.id,
      mode: this.data.executionMode
    })
      .then(response => {
        // 开始 SSE 流式监听
        this.listenToExecution(response.execution_id)
      })
      .catch(err => {
        wx.showToast({ title: '执行失败', icon: 'error' })
      })
  },

  // 监听执行进度
  listenToExecution(executionId) {
    API.sse(`/agent/executions/${executionId}/stream`, {}, 
      (data) => {
        // 处理实时进度更新
        this.handleExecutionUpdate(data)
      },
      (err) => {
        console.error('SSE error:', err)
      }
    )
  },

  // 处理执行更新
  handleExecutionUpdate(data) {
    const { event, step, percent, message, result } = data
    
    if (event === 'step_start') {
      this.addSystemMessage(`开始执行步骤 ${step}: ${message}`)
    } else if (event === 'step_progress') {
      this.addSystemMessage(`步骤 ${step} 进度: ${percent}% - ${message}`)
    } else if (event === 'step_complete') {
      this.addSystemMessage(`步骤 ${step} 完成: ${result}`)
    } else if (event === 'done') {
      this.addSystemMessage(`执行完成: ${data.summary}`)
    }
  },

  // 添加系统消息
  addSystemMessage(content) {
    const systemMsg = { role: 'system', content }
    const messages = [...this.data.messages, systemMsg]
    this.setData({ messages })
  },

  // 获取模式标签
  getModeLabel(mode) {
    const found = this.data.executionModes.find(m => m.value === mode)
    return found ? found.label : mode
  },

  // 输入框变化
  onInputChange(e) {
    this.setData({ inputValue: e.detail.value })
  },

  // 切换执行模式
  onModeChange(e) {
    this.setData({ executionMode: e.detail.value })
  }
})