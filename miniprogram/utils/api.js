// utils/api.js - 统一 API 请求工具
const app = getApp()

const API = {
  baseURL: app.globalData.apiBaseURL,

  // 获取请求头
  getHeaders() {
    const token = wx.getStorageSync('token')
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    }
  },

  // 统一请求方法
  request(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.baseURL}${endpoint}`,
        method,
        data,
        header: this.getHeaders(),
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${res.data?.message || 'Unknown error'}`))
          }
        },
        fail: (err) => {
          reject(new Error(`Network error: ${err.errMsg}`))
        }
      })
    })
  },

  // 快捷方法
  get(endpoint) {
    return this.request('GET', endpoint)
  },

  post(endpoint, data) {
    return this.request('POST', endpoint, data)
  },

  put(endpoint, data) {
    return this.request('PUT', endpoint, data)
  },

  delete(endpoint, data) {
    return this.request('DELETE', endpoint, data)
  },

  // SSE 流式响应（用于 AI Agent 实时反馈）
  sse(endpoint, data, onMessage, onError) {
    return new Promise((resolve, reject) => {
      const task = wx.connectSocket({
        url: `${this.baseURL}${endpoint}`,
        header: this.getHeaders(),
        method: 'POST'
      })

      task.onOpen(() => {
        task.send({
          data: JSON.stringify(data)
        })
      })

      task.onMessage((res) => {
        try {
          const data = JSON.parse(res.data)
          onMessage(data)
        } catch (err) {
          console.error('SSE parse error:', err)
        }
      })

      task.onError((err) => {
        onError?.(err)
        reject(err)
      })

      task.onClose(() => {
        resolve()
      })
    })
  }
}

module.exports = API