const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    selectedProvider: '',
    selectedProviderName: '',
    accountName: '',
    accessKey: '',
    secretKey: '',
    region: '',
    canSubmit: false,
    theme: 'dark'
  },

  onLoad() {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('acc.add_title') })
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'acc.add_title', 'acc.cloud_label', 'acc.name_label', 'acc.name_placeholder',
      'acc.access_key', 'acc.access_placeholder', 'acc.secret_key', 'acc.secret_placeholder',
      'acc.region_label', 'acc.region_placeholder', 'acc.save', 'acc.saved'
    ])})
  },

  onCloudSelect(e) {
    this.setData({
      selectedProvider: e.detail.id,
      selectedProviderName: e.detail.name
    }, function() { this.checkCanSubmit() }.bind(this))
  },

  onNameInput(e) {
    this.setData({ accountName: e.detail.value }, function() { this.checkCanSubmit() }.bind(this))
  },

  onAccessKeyInput(e) {
    this.setData({ accessKey: e.detail.value }, function() { this.checkCanSubmit() }.bind(this))
  },

  onSecretKeyInput(e) {
    this.setData({ secretKey: e.detail.value }, function() { this.checkCanSubmit() }.bind(this))
  },

  onRegionInput(e) {
    this.setData({ region: e.detail.value }, function() { this.checkCanSubmit() }.bind(this))
  },

  checkCanSubmit() {
    var s = this.data
    this.setData({ canSubmit: !!(s.selectedProvider && s.accountName && s.accessKey && s.secretKey) })
  },

  onSubmit() {
    var d = this.data
    var payload = {
      provider: d.selectedProvider,
      name: d.accountName,
      access_key: d.accessKey,
      secret_key: d.secretKey,
      region: d.region
    }
    API.post('/accounts', payload).then(function(data) {
      var account = data.account || data
      account.providerLabel = account.providerLabel || d.selectedProviderName || API.getProviderLabel(d.selectedProvider)
      var list = wx.getStorageSync('cloud_accounts') || []
      list.push(account)
      wx.setStorageSync('cloud_accounts', list)
      wx.showToast({ title: i18n.t('acc.saved'), icon: 'success' })
      setTimeout(function() { wx.navigateBack() }, 1500)
    }.bind(this)).catch(function() {
      wx.showToast({ title: i18n.t('chat.request_failed'), icon: 'none' })
    })
  }
})
