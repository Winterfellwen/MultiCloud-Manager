// pages/accounts/list.js
Page({
  data: {
    accounts: []
  },

  onLoad() {
    this.loadAccounts()
  },

  onShow() {
    this.loadAccounts()
  },

  loadAccounts() {
    const app = getApp()
    const list = wx.getStorageSync('cloud_accounts')
    this.setData({ accounts: list || [] })
  },

  onDelete(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '确认删除',
      content: '确定要删除此云账号吗？',
      success: (res) => {
        if (res.confirm) {
          const list = this.data.accounts.filter(a => a.id !== id)
          wx.setStorageSync('cloud_accounts', list)
          this.setData({ accounts: list })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
