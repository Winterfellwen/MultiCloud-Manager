const i18n = require('../../utils/i18n')

Page({
  data: {
    userInfo: null,
    theme: 'dark',
    notifyEnabled: true,
    currentLang: 'zh',
    langOptions: ['中文', 'English']
  },

  onLoad() {
    const app = getApp()
    this.setLang()
    wx.setNavigationBarTitle({ title: i18n.t('nav.profile') })
    this.setData({
      userInfo: app.globalData.userInfo,
      theme: app.globalData.theme || 'dark'
    })
  },

  onShow() {
    const app = getApp()
    this.setData({
      userInfo: app.globalData.userInfo,
      theme: app.globalData.theme || 'dark'
    })
  },

  setLang() {
    var lang = wx.getStorageSync('lang') || 'zh'
    var langData = i18n.getLangData([
      'user.not_logged_in', 'user.login_hint', 'user.dark_mode', 'user.notifications',
      'user.accounts', 'user.team_management', 'user.terraform_config',
      'user.version', 'user.version_value', 'user.logout',
      'user.confirm_logout_title', 'user.confirm_logout_content', 'user.logged_out',
      'user.language', 'user.zh', 'user.en',
      'user.change_password', 'user.usage', 'user.system_logs',
      'user.role_admin', 'user.role_operator', 'user.role_viewer', 'user.user_management'
    ])
    this.setData({
      lang: langData,
      currentLang: lang,
      roleLabels: {
        admin: langData.user_role_admin,
        operator: langData.user_role_operator,
        viewer: langData.user_role_viewer
      }
    })
  },

  onThemeToggle(e) {
    var theme = e.detail.value ? 'dark' : 'light'
    this.setData({ theme: theme })
    getApp().setTheme(theme)
  },

  onNotifyToggle(e) {
    this.setData({ notifyEnabled: e.detail.value })
    wx.setStorageSync('notify_enabled', e.detail.value)
  },

  onLangChange(e) {
    var idx = e.detail.value
    var locale = idx === 0 ? 'zh' : 'en'
    getApp().setLang(locale)
    this.setData({ currentLang: locale })
    wx.showToast({ title: locale === 'zh' ? '已切换至中文' : 'Switched to English', icon: 'success' })
  },

  onLogout() {
    const app = getApp()
    wx.showModal({
      title: i18n.t('user.confirm_logout_title'),
      content: i18n.t('user.confirm_logout_content'),
      success: function(res) {
        if (res.confirm) {
          app.globalData.token = ''
          app.globalData.userInfo = null
          wx.removeStorageSync('token')
          this.setData({ userInfo: null })
          wx.showToast({ title: i18n.t('user.logged_out'), icon: 'success' })
          setTimeout(function() {
            wx.redirectTo({ url: '/pages/login/login' })
          }, 1000)
        }
      }.bind(this)
    })
  }
})
