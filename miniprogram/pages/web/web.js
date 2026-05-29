const config = require('../../config')

function buildWebUrl(page) {
  const base = config.webBaseURL.replace(/\/$/, '')
  return base + '/' + page + '?embedded=1'
}

Page({
  data: {
    url: '',
    error: '',
    loading: true
  },

  onLoad(options) {
    this._page = options.page || 'index.html'
    this.loadWebView()
  },

  loadWebView() {
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === 'none') {
          this.setData({
            url: '',
            error: '网络不可用，请检查连接后重试',
            loading: false
          })
          return
        }
        this.setData({
          url: buildWebUrl(this._page),
          error: '',
          loading: false
        })
      },
      fail: () => {
        this.setData({
          url: buildWebUrl(this._page),
          error: '',
          loading: false
        })
      }
    })
  },

  onRetry() {
    this.setData({ loading: true, error: '' })
    this.loadWebView()
  },

  onWebLoad() {
    this.setData({ error: '', loading: false })
  },

  onWebError(e) {
    console.error('web-view load error', e.detail)
    this.setData({
      url: '',
      error: '页面加载失败，请确认已在小程序后台配置业务域名',
      loading: false
    })
  },

  onShareAppMessage() {
    return {
      title: 'MultiCloud 多云管理',
      path: '/pages/web/web'
    }
  }
})
