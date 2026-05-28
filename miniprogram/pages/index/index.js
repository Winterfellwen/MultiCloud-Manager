const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    stats: [],
    recentResources: [],
    activities: [],
    theme: 'dark'
  },

  onLoad() {
    const app = getApp()
    this.setLang()
    this.setData({ theme: app.globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('home.title') })
    this.loadStats()
    this.loadRecentResources()
  },

  onShow() {
    const app = getApp()
    this.setData({ theme: app.globalData.theme || 'dark' })
    this.loadStats()
  },

  onPullDownRefresh() {
    this.loadStats(() => {
      wx.stopPullDownRefresh()
    })
    this.loadRecentResources()
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'home.title', 'home.subtitle', 'home.quick_actions', 'home.resources',
      'home.accounts', 'home.terraform', 'home.team', 'home.recent',
      'home.stat_resources', 'home.stat_accounts', 'home.stat_terraform', 'home.stat_members',
      'home.activity', 'home.activity_empty'
    ])})
  },

  loadStats(callback) {
    var titles = [
      i18n.t('home.stat_resources'),
      i18n.t('home.stat_accounts'),
      i18n.t('home.stat_terraform'),
      i18n.t('home.stat_members')
    ]
    var stats = titles.map(function(t) { return { title: t, value: '--' } })
    this.setData({ stats: stats })
    API.get('/stats').then(function(data) {
      var statsData = data.stats || data
      var keys = ['resources', 'accounts', 'terraform', 'members']
      var updated = stats.map(function(s, i) {
        s.value = statsData[keys[i]] != null ? String(statsData[keys[i]]) : '--'
        return s
      })
      this.setData({ stats: updated })
      callback && callback()
    }.bind(this)).catch(function() {
      callback && callback()
    })
  },

  loadRecentResources() {
    API.get('/resources').then(function(data) {
      var list = (data.resources || data || []).slice(0, 5)
      this.setData({ recentResources: list })
    }.bind(this)).catch(function() {
      this.setData({ recentResources: [] })
    }.bind(this))
  },

  loadActivities() {
    this.setData({ activities: [] })
  },

  onShareAppMessage() {
    return {
      title: i18n.t('home.share_title'),
      path: '/pages/index/index'
    }
  }
})
