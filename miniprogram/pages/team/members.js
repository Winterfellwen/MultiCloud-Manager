// pages/team/members.js
Page({
  data: {
    members: []
  },

  onLoad() {
    this.loadMembers()
  },

  onShow() {
    this.loadMembers()
  },

  loadMembers() {
    const list = wx.getStorageSync('team_members')
    this.setData({ members: list || [] })
  }
})
