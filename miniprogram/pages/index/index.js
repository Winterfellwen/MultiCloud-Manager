// pages/index/index.js
const app = getApp()

Page({
  data: {
    stats: [
      { title: '云资源', value: '0' },
      { title: '云账号', value: '0' },
      { title: 'Terraform', value: '0' },
      { title: '团队成员', value: '0' }
    ],
    recentResources: []
  },

  onLoad() {
    this.loadStats()
    this.loadRecentResources()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadStats()
  },

  onPullDownRefresh() {
    this.loadStats(() => {
      wx.stopPullDownRefresh()
    })
    this.loadRecentResources()
  },

  loadStats(callback) {
    // TODO: 从后端API获取统计数据
    const stats = [
      { title: '云资源', value: '--' },
      { title: '云账号', value: '--' },
      { title: 'Terraform', value: '--' },
      { title: '团队成员', value: '--' }
    ]

    this.setData({ stats })
    callback && callback()
  },

  loadRecentResources() {
    // TODO: 从后端API获取最近访问的资源
    this.setData({
      recentResources: []
    })
  },

  onShareAppMessage() {
    return {
      title: '多云管理平台',
      path: '/pages/index/index'
    }
  }
})
