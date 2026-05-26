// pages/user/profile.js
const app = getApp()

Page({
  data: {
    userInfo: null,
    theme: 'dark',
    notifyEnabled: true
  },

  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo,
      theme: app.globalData.theme || 'dark'
    })
  },

  onShow() {
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  onThemeToggle(e) {
    const theme = e.detail.value ? 'dark' : 'light'
    this.setData({ theme })
    app.setTheme(theme)
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: theme === 'dark' ? '#1a1d27' : '#6366f1'
    })
  },

  onNotifyToggle(e) {
    this.setData({ notifyEnabled: e.detail.value })
    wx.setStorageSync('notify_enabled', e.detail.value)
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.token = ''
          app.globalData.userInfo = null
          wx.removeStorageSync('token')
          this.setData({ userInfo: null })
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      }
    })
  }
})
