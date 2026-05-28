const i18n = require('../../utils/i18n')

Page({
  data: {
    configs: [],
    theme: 'dark'
  },

  onLoad() {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('tf.list_title') })
    this.loadConfigs()
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    this.loadConfigs()
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'tf.list_title', 'tf.upload', 'tf.deploy', 'tf.empty', 'tf.empty_hint',
      'tf.confirm_deploy_title', 'tf.confirm_deploy_content', 'tf.deploy_triggered'
    ])})
  },

  loadConfigs() {
    var list = wx.getStorageSync('tf_configs')
    this.setData({ configs: list || [] })
  },

  onApply(e) {
    wx.showModal({
      title: i18n.t('tf.confirm_deploy_title'),
      content: i18n.t('tf.confirm_deploy_content'),
      success: function(res) {
        if (res.confirm) wx.showToast({ title: i18n.t('tf.deploy_triggered'), icon: 'success' })
      }
    })
  }
})
