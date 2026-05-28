// utils/api.js - 统一 API 请求工具

const API = {
  get baseURL() {
    const app = getApp();
    return app ? app.globalData.apiBaseURL : 'https://multicloud-backend-qw9d.onrender.com/api';
  },

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
          if (res.statusCode === 401) {
            wx.removeStorageSync('token')
            const app = getApp()
            if (app && app.globalData) {
              app.globalData.token = ''
              app.globalData.userInfo = null
            }
            // 自动化测试模式：不重定向，避免页面被销毁
            if (!wx.getStorageSync('__automation__')) {
              const pages = getCurrentPages()
              const currentPage = pages.length > 0 ? pages[pages.length - 1].route : ''
              if (currentPage !== 'pages/login/login') {
                wx.redirectTo({ url: '/pages/login/login' })
              }
            }
            reject(new Error('Session expired'))
            return
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            reject(new Error('API Error ' + res.statusCode + ': ' + ((res.data && res.data.message) || 'Unknown error')))
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

  // 轮询（替代 SSE，微信小程序不支持 HTTP 流式）
  poll(endpoint, interval = 2000, onData, onError) {
    var stopped = false
    var pollFn = function() {
      if (stopped) return
      this.get(endpoint)
        .then(function(data) {
          onData(data)
          if (data.status !== 'completed' && data.status !== 'failed') {
            setTimeout(pollFn, interval)
          }
        })
        .catch(function(err) {
          onError?.(err)
          stopped = true
        })
    }.bind(this)
    setTimeout(pollFn, interval)
    return function() { stopped = true }
  }
}

API.getProviderLabel = function(provider) {
  var map = { azure: 'Azure', tencent: '\u817e\u8baf\u4e91', oracle: 'Oracle Cloud', render: 'Render' }
  return map[provider] || provider
}

module.exports = API