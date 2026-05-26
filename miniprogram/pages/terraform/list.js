// pages/terraform/list.js
Page({
  data: {
    configs: []
  },

  onLoad() {
    this.loadConfigs()
  },

  onShow() {
    this.loadConfigs()
  },

  loadConfigs() {
    const list = wx.getStorageSync('tf_configs')
    this.setData({ configs: list || [] })
  },

  onApply(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '确认部署',
      content: '确定要部署此 Terraform 配置吗？',
      success: (res) => {
        if (res.confirm) wx.showToast({ title: '部署已触发', icon: 'success' })
      }
    })
  }
})
