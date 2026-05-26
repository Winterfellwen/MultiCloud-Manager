// pages/terraform/upload.js
Page({
  data: {
    fileName: '',
    configName: '',
    providerIndex: 0,
    providers: ['Azure', '腾讯云', 'Oracle', 'Render']
  },

  onPickFile() {
    wx.showToast({ title: '文件选择功能开发中', icon: 'none' })
  },

  onNameInput(e) {
    this.setData({ configName: e.detail.value })
  },

  onProviderChange(e) {
    this.setData({ providerIndex: e.detail.value })
  },

  onUpload() {
    wx.showToast({ title: '上传成功', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 1500)
  }
})
