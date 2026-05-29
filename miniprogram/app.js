const config = require('./config')

App({
  onLaunch() {},

  globalData: {
    apiBaseURL: config.webBaseURL + '/api'
  }
})
