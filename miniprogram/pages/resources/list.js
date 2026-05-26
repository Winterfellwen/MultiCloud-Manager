// pages/resources/list.js
Page({
  data: {
    resources: [],
    filteredResources: [],
    cloudTypes: ['全部云', 'Azure', '腾讯云', 'Oracle', 'Render'],
    statusTypes: ['全部状态', 'running', 'stopped'],
    cloudIndex: 0,
    statusIndex: 0
  },

  onLoad() {
    this.loadResources()
  },

  onShow() {
    this.loadResources()
  },

  loadResources() {
    const app = getApp()
    const list = wx.getStorageSync('cloud_resources')
    this.setData({ resources: list || [] })
    this.applyFilters()
  },

  applyFilters() {
    let list = [...this.data.resources]
    if (this.data.cloudIndex > 0) {
      const providers = ['', 'azure', 'tencent', 'oracle', 'render']
      list = list.filter(r => r.provider === providers[this.data.cloudIndex])
    }
    if (this.data.statusIndex > 0) {
      const statuses = ['', 'running', 'stopped']
      list = list.filter(r => r.status === statuses[this.data.statusIndex])
    }
    this.setData({ filteredResources: list })
  },

  onCloudFilter(e) {
    this.setData({ cloudIndex: e.detail.value }, () => this.applyFilters())
  },

  onStatusFilter(e) {
    this.setData({ statusIndex: e.detail.value }, () => this.applyFilters())
  },

  onStart(e) {},
  onStop(e) {}
})
