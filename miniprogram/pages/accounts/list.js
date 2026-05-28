const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    accounts: [],
    theme: 'dark'
  },

  onLoad() {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('acc.list_title') })
    this.loadAccounts()
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    this.loadAccounts()
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'acc.list_title', 'acc.add', 'acc.connected', 'acc.error', 'acc.delete',
      'acc.empty', 'acc.empty_hint', 'acc.delete_title', 'acc.delete_content', 'acc.deleted'
    ])})
  },

  loadAccounts() {
    var cached = wx.getStorageSync('cloud_accounts') || []
    this.setData({ accounts: cached })
    API.get('/accounts').then(function(data) {
      var list = (data.accounts || data || []).map(function(a) {
        a.providerLabel = a.providerLabel || API.getProviderLabel(a.provider)
        return a
      })
      this.setData({ accounts: list })
      wx.setStorageSync('cloud_accounts', list)
    }.bind(this)).catch(function() {})
  },

  onDelete(e) {
    var id = e.currentTarget.dataset.id
    wx.showModal({
      title: i18n.t('acc.delete_title'),
      content: i18n.t('acc.delete_content'),
      success: function(res) {
        if (res.confirm) {
          API.delete('/accounts/' + id).then(function() {
            var list = this.data.accounts.filter(function(a) { return a.id !== id })
            wx.setStorageSync('cloud_accounts', list)
            this.setData({ accounts: list })
            wx.showToast({ title: i18n.t('acc.deleted'), icon: 'success' })
          }.bind(this)).catch(function() {
            wx.showToast({ title: i18n.t('chat.request_failed'), icon: 'none' })
          })
        }
      }.bind(this)
    })
  }
})
