const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    members: [],
    theme: 'dark'
  },

  onLoad() {
    this.setLang()
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    wx.setNavigationBarTitle({ title: i18n.t('team.title') })
    this.loadMembers()
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme || 'dark' })
    this.loadMembers()
  },

  setLang() {
    this.setData({ lang: i18n.getLangData([
      'team.title', 'team.invite', 'team.online', 'team.offline', 'team.empty', 'team.empty_hint'
    ])})
  },

  loadMembers() {
    var cached = wx.getStorageSync('team_members') || []
    this.setData({ members: cached })
    API.get('/teams/members').then(function(data) {
      var list = data.members || data || []
      this.setData({ members: list })
      wx.setStorageSync('team_members', list)
    }.bind(this)).catch(function() {})
  },

  onInvite() {
    wx.showModal({
      title: i18n.t('team.title'),
      content: '邀请功能开发中',
      showCancel: false
    })
  }
})
