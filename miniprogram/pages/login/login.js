const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    username: '',
    password: '',
    error: '',
    loading: false,
    theme: 'dark',
    lang: {}
  },

  onLoad() {
    const app = getApp()
    this.setData({
      theme: app.globalData.theme || 'dark',
      lang: i18n.getLangData([
        'login.title', 'login.username', 'login.password',
        'login.login_btn', 'login.wechat_btn',
        'login.error_required', 'login.error_invalid', 'login.error_minlength',
        'login.success'
      ])
    })
    wx.setNavigationBarTitle({ title: i18n.t('login.title') })
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  onLogin() {
    const app = getApp()
    const { username, password } = this.data
    if (!username || !password) {
      this.setData({ error: this.data.lang.login_error_required })
      return
    }
    if (password.length < 8) {
      this.setData({ error: this.data.lang.login_error_minlength })
      return
    }

    this.setData({ loading: true, error: '' })

    API.post('/auth/login', { username, password })
      .then(data => {
        wx.setStorageSync('token', data.token)
        app.globalData.token = data.token
        app.globalData.userInfo = data.user
        wx.showToast({ title: this.data.lang.login_success, icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1000)
      })
      .catch(err => {
        this.setData({ error: this.data.lang.login_error_invalid })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  onWechatLogin() {
    this.setData({ loading: true, error: '' })
    const app = getApp()
    app.login()
      .then(data => {
        if (data && data.token) {
          wx.showToast({ title: this.data.lang.login_success, icon: 'success' })
          setTimeout(() => {
            wx.switchTab({ url: '/pages/index/index' })
          }, 1000)
        } else {
          this.setData({ error: this.data.lang.login_error_invalid })
        }
      })
      .catch(() => {
        this.setData({ error: this.data.lang.login_error_invalid })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  }
})
