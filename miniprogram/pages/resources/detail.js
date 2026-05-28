const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    resource: {},
    theme: 'dark'
  },

  onLoad(options) {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('res.detail_title') })
    if (options.id) {
      var resources = wx.getStorageSync('cloud_resources') || []
      var resource = resources.find(function(r) { return r.id === options.id })
      resource = resource || {}
      resource.providerLabel = resource.providerLabel || API.getProviderLabel(resource.provider)
      this.setData({ resource: resource })
    }
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'res.detail_title', 'res.back', 'res.name', 'res.cloud', 'res.status',
      'res.region_label', 'res.spec_label', 'res.created_at',
      'res.start_resource', 'res.stop_resource', 'res.delete_resource',
      'res.starting', 'res.stopping', 'res.start_success', 'res.stop_success',
      'res.confirm_delete', 'res.confirm_delete_content', 'res.deleted'
    ])})
  },

  onStart() {
    wx.showToast({ title: i18n.t('res.starting'), icon: 'none' })
    API.post('/resources/' + this.data.resource.id + '/start').then(function() {
      wx.showToast({ title: i18n.t('res.start_success'), icon: 'success' })
    }).catch(function() {
      wx.showToast({ title: i18n.t('chat.request_failed'), icon: 'none' })
    })
  },

  onStop() {
    wx.showToast({ title: i18n.t('res.stopping'), icon: 'none' })
    API.post('/resources/' + this.data.resource.id + '/stop').then(function() {
      wx.showToast({ title: i18n.t('res.stop_success'), icon: 'success' })
    }).catch(function() {
      wx.showToast({ title: i18n.t('chat.request_failed'), icon: 'none' })
    })
  },

  onDelete() {
    wx.showModal({
      title: i18n.t('res.confirm_delete'),
      content: i18n.t('res.confirm_delete_content'),
      success: function(res) {
        if (res.confirm) {
          API.delete('/resources/' + this.data.resource.id).then(function() {
            wx.showToast({ title: i18n.t('res.deleted'), icon: 'success' })
            setTimeout(function() { wx.navigateBack() }, 1500)
          }.bind(this)).catch(function() {
            wx.showToast({ title: i18n.t('chat.request_failed'), icon: 'none' })
          })
        }
      }.bind(this)
    })
  }
})
