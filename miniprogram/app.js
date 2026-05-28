const API = require('/utils/api')
const i18n = require('/utils/i18n')

App({
  onLaunch() {
    const theme = wx.getStorageSync('theme') || 'dark'
    this.globalData.theme = theme
    this.applyNavBarColor(theme)
    i18n.init()
    i18n.setTabBarLang()
    this.checkAuth()
  },

  checkAuth() {
    // 自动化测试模式：跳过认证检查
    if (wx.getStorageSync('__automation__')) return
    const token = wx.getStorageSync('token')
    if (!token) {
      this.redirectToLogin()
      return
    }
    this.globalData.token = token
    API.get('/auth/profile')
      .then(data => {
        this.globalData.userInfo = data
      })
      .catch(() => {
        wx.removeStorageSync('token')
        this.globalData.token = ''
        this.globalData.userInfo = null
        // api.js already redirects to login on 401, only redirect if not already handled
        const pages = getCurrentPages()
        const currentPage = pages.length > 0 ? pages[pages.length - 1].route : ''
        if (currentPage !== 'pages/login/login') {
          this.redirectToLogin()
        }
      })
  },

  redirectToLogin() {
    const pages = getCurrentPages()
    const currentPage = pages.length > 0 ? pages[pages.length - 1].route : ''
    if (currentPage !== 'pages/login/login') {
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },

  login() {
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve(null) }
      }, 5000)

      wx.login({
        success: (res) => {
          if (settled) return
          clearTimeout(timer)
          settled = true
          if (res.code) {
            API.post('/auth/wechat', { code: res.code })
              .then(data => {
                if (data && data.token) {
                  this.globalData.token = data.token
                  this.globalData.userInfo = data.user
                  wx.setStorageSync('token', data.token)
                  wx.setStorageSync('userInfo', data.user)
                  resolve(data)
                } else {
                  resolve(null)
                }
              })
              .catch(() => {
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
    apiBaseURL: 'https://multicloud-backend-qw9d.onrender.com/api'
  },

  setLang(locale) {
    i18n.switchLang(locale)
    i18n.setTabBarLang()
    const pages = getCurrentPages()
    pages.forEach(function(page) {
      if (page.setLang) page.setLang()
    })
  },

  setTheme(theme) {
    this.globalData.theme = theme
    wx.setStorageSync('theme', theme)
    this.applyNavBarColor(theme)
    this.propagateTheme()
  },

  applyNavBarColor(theme) {
    wx.setNavigationBarColor(
      theme === 'light'
        ? { frontColor: '#000000', backgroundColor: '#6366f1' }
        : { frontColor: '#ffffff', backgroundColor: '#1a1d27' }
    )
  },

  propagateTheme() {
    const pages = getCurrentPages()
    pages.forEach(function(page) {
      if (page.setData) {
        page.setData({ theme: this.globalData.theme })
      }
    }.bind(this))
  }
})
