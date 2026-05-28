const i18n = require('../../utils/i18n')

Page({
  data: {
    fileName: '',
    configName: '',
    providerIndex: 0,
    providers: [],
    theme: 'dark'
  },

  onLoad() {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('tf.upload_title') })
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
  },

  setLang() {
    var lang = i18n.getLangData([
      'tf.upload_title', 'tf.back', 'tf.select_file', 'tf.file_hint',
      'tf.name_label', 'tf.name_placeholder', 'tf.cloud_label', 'tf.submit',
      'tf.file_picker_dev', 'tf.uploaded'
    ])
    this.setData({ lang: lang, providers: [i18n.t('res.filter_azure'), i18n.t('res.filter_tencent'), i18n.t('res.filter_oracle'), i18n.t('res.filter_render')] })
  },

  onPickFile() {
    wx.showToast({ title: i18n.t('tf.file_picker_dev'), icon: 'none' })
  },

  onNameInput(e) {
    this.setData({ configName: e.detail.value })
  },

  onProviderChange(e) {
    this.setData({ providerIndex: e.detail.value })
  },

  onUpload() {
    wx.showToast({ title: i18n.t('tf.uploaded'), icon: 'success' })
    setTimeout(function() { wx.navigateBack() }, 1500)
  }
})
