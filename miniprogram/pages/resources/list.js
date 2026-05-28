const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    resources: [],
    filteredResources: [],
    cloudTypes: [],
    statusTypes: [],
    cloudIndex: 0,
    statusIndex: 0,
    theme: 'dark',
    searchText: '',
    isSyncing: false,
    lastSyncTime: '',
    lastSyncLabel: ''
  },

  onLoad() {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('res.list_title') })
    this.loadResources()
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    this.loadResources()
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'res.list_title', 'res.filter_all_cloud', 'res.filter_all_status',
      'res.running', 'res.stopped', 'res.start', 'res.stop',
      'res.region', 'res.spec', 'res.empty', 'res.empty_hint',
      'res.filter_azure', 'res.filter_tencent', 'res.filter_oracle', 'res.filter_render',
      'res.search', 'res.search_placeholder', 'res.sync', 'res.syncing',
      'res.synced', 'res.last_sync', 'res.sync_now',
      'res.start_success', 'res.stop_success', 'res.search_no_result'
    ])})
    this.setData({
      cloudTypes: [i18n.t('res.filter_all_cloud'), i18n.t('res.filter_azure'), i18n.t('res.filter_tencent'), i18n.t('res.filter_oracle'), i18n.t('res.filter_render')],
      statusTypes: [i18n.t('res.filter_all_status'), i18n.t('res.running'), i18n.t('res.stopped')]
    })
    var lastSync = wx.getStorageSync('last_sync_time')
    if (lastSync) {
      this.setData({ lastSyncTime: lastSync, lastSyncLabel: i18n.t('res.last_sync', { time: lastSync }) })
    }
  },

  loadResources() {
    var list = wx.getStorageSync('cloud_resources')
    this.setData({ resources: list || [] })
    this.applyFilters()
    API.get('/resources').then(function(data) {
      var enriched = (data.resources || data || []).map(function(r) {
        r.providerLabel = API.getProviderLabel(r.provider)
        return r
      })
      this.setData({ resources: enriched })
      wx.setStorageSync('cloud_resources', enriched)
      this.applyFilters()
    }.bind(this)).catch(function() {})
  },

  onCloudFilter(e) {
    this.setData({ cloudIndex: e.detail.value }, function() { this.applyFilters() }.bind(this))
  },

  onStatusFilter(e) {
    this.setData({ statusIndex: e.detail.value }, function() { this.applyFilters() }.bind(this))
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value })
    this.applyFilters()
  },

  applyFilters() {
    var list = [].concat(this.data.resources)
    if (this.data.cloudIndex > 0) {
      var providers = ['', 'azure', 'tencent', 'oracle', 'render']
      list = list.filter(function(r) { return r.provider === providers[this.data.cloudIndex] }.bind(this))
    }
    if (this.data.statusIndex > 0) {
      var statuses = ['', 'running', 'stopped']
      list = list.filter(function(r) { return r.status === statuses[this.data.statusIndex] }.bind(this))
    }
    if (this.data.searchText) {
      var q = this.data.searchText.toLowerCase()
      list = list.filter(function(r) { return r.name && r.name.toLowerCase().indexOf(q) !== -1 })
    }
    this.setData({ filteredResources: list })
  },

  syncResources() {
    this.setData({ isSyncing: true })
    API.post('/resources/sync', {}).then(function(data) {
      var now = new Date()
      var timeStr = now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes()
      this.setData({ isSyncing: false, lastSyncTime: timeStr, lastSyncLabel: i18n.t('res.last_sync', { time: timeStr }) })
      wx.setStorageSync('last_sync_time', timeStr)
      this.loadResources()
      wx.showToast({ title: i18n.t('res.synced'), icon: 'success' })
    }.bind(this)).catch(function(err) {
      this.setData({ isSyncing: false })
      wx.showToast({ title: err.message || i18n.t('chat.request_failed'), icon: 'none' })
    }.bind(this))
  },

  startResource(e) {
    var id = e.currentTarget.dataset.id
    wx.showLoading({ title: i18n.t('res.starting') })
    API.post('/resources/' + id + '/start', {}).then(function() {
      wx.hideLoading()
      wx.showToast({ title: i18n.t('res.start_success'), icon: 'success' })
      this.loadResources()
    }.bind(this)).catch(function(err) {
      wx.hideLoading()
      wx.showToast({ title: err.message, icon: 'none' })
    })
  },

  stopResource(e) {
    var id = e.currentTarget.dataset.id
    wx.showLoading({ title: i18n.t('res.stopping') })
    API.post('/resources/' + id + '/stop', {}).then(function() {
      wx.hideLoading()
      wx.showToast({ title: i18n.t('res.stop_success'), icon: 'success' })
      this.loadResources()
    }.bind(this)).catch(function(err) {
      wx.hideLoading()
      wx.showToast({ title: err.message, icon: 'none' })
    })
  }
})
