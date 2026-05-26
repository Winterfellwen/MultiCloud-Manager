// app.js - 多云管理小程序入口
const API = require('/utils/api')

App({
  onLaunch() {
    const theme = wx.getStorageSync('theme') || 'dark'
    this.globalData.theme = theme
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#1a1d27'
    })
    setTimeout(() => {
      this.login().catch(() => {})
    }, 100)
  },

  login() {
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve(null) }
      }, 3000)

      wx.login({
        success: (res) => {
          if (settled) return
          clearTimeout(timer)
          settled = true
          if (res.code) {
            API.post('/auth/login', { code: res.code })
              .then(data => {
                this.globalData.token = data.token
                this.globalData.userInfo = data.user
                wx.setStorageSync('token', data.token)
                resolve(data)
              })
              .catch(() => {
                console.warn('Backend unavailable, using local mode')
                resolve(null)
              })
          } else {
            resolve(null)
          }
        },
        fail: () => {
          if (!settled) { clearTimeout(timer); settled = true; resolve(null) }
        }
      })
    })
  },

  globalData: {
    token: '',
    userInfo: null,
    currentTeam: null,
    theme: 'dark',
    apiBaseURL: 'https://multicloud-backend.onrender.com/api'
  },

  setTheme(theme) {
    this.globalData.theme = theme
    wx.setStorageSync('theme', theme)
  }
})
