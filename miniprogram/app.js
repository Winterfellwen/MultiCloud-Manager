// app.js - 多云管理小程序入口
const API = require('/utils/api')

App({
  onLaunch() {
    // 微信登录
    this.login()
  },

  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            API.post('/auth/login', { code: res.code })
              .then(data => {
                this.globalData.token = data.token
                this.globalData.userInfo = data.user
                wx.setStorageSync('token', data.token)
                resolve(data)
              })
              .catch(reject)
          } else {
            reject(new Error('wx.login failed'))
          }
        },
        fail: reject
      })
    })
  },

  globalData: {
    token: '',
    userInfo: null,
    currentTeam: null,
    apiBaseURL: 'https://multicloud-backend.onrender.com/api'
  }
})