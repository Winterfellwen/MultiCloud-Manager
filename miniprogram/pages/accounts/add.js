// pages/accounts/add.js
Page({
  data: {
    selectedProvider: '',
    accountName: '',
    accessKey: '',
    secretKey: '',
    region: '',
    canSubmit: false
  },

  onCloudSelect(e) {
    this.setData({ selectedProvider: e.detail.id }, () => this.checkCanSubmit())
  },

  onNameInput(e) {
    this.setData({ accountName: e.detail.value }, () => this.checkCanSubmit())
  },

  onAccessKeyInput(e) {
    this.setData({ accessKey: e.detail.value }, () => this.checkCanSubmit())
  },

  onSecretKeyInput(e) {
    this.setData({ secretKey: e.detail.value }, () => this.checkCanSubmit())
  },

  onRegionInput(e) {
    this.setData({ region: e.detail.value }, () => this.checkCanSubmit())
  },

  checkCanSubmit() {
    const { selectedProvider, accountName, accessKey, secretKey } = this.data
    this.setData({ canSubmit: !!(selectedProvider && accountName && accessKey && secretKey) })
  },

  onSubmit() {
    const { selectedProvider, accountName, accessKey, secretKey, region } = this.data
    const list = wx.getStorageSync('cloud_accounts') || []
    list.push({
      id: 'acc_' + Date.now(),
      provider: selectedProvider,
      name: accountName,
      accessKey,
      secretKey,
      region,
      status: 'active',
      createdAt: new Date().toISOString()
    })
    wx.setStorageSync('cloud_accounts', list)
    wx.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 1500)
  }
})
