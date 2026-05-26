// pages/resources/detail.js
Page({
  data: {
    resource: {}
  },

  onLoad(options) {
    if (options.id) {
      const resources = wx.getStorageSync('cloud_resources') || []
      const resource = resources.find(r => r.id === options.id)
      this.setData({ resource: resource || {} })
    }
  },

  onStart() {
    wx.showToast({ title: '启动中...', icon: 'none' })
  },

  onStop() {
    wx.showToast({ title: '停止中...', icon: 'none' })
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除此资源吗？',
      success: (res) => {
        if (res.confirm) wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
