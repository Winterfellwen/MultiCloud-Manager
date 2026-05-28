Component({
  properties: {
    cloudList: {
      type: Array,
      value: [
        { id: 'azure', name: 'Azure', icon: '☁️' },
        { id: 'tencent', name: '\u817e\u8baf\u4e91', icon: '🌐' },
        { id: 'oracle', name: 'Oracle Cloud', icon: '🔶' },
        { id: 'render', name: 'Render', icon: '⚡' }
      ]
    },
    selectedId: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: '\u9009\u62e9\u4e91\u5e73\u53f0'
    }
  },

  data: {
    currentIndex: 0
  },

  attached: function() {
    var i18n = require('../../utils/i18n')
    this.setData({ title: i18n.t('cloud_selector.title') })
  },

  methods: {
    onSelect(e) {
      var index = e.currentTarget.dataset.index
      var item = this.data.cloudList[index]
      this.setData({ currentIndex: index })
      this.triggerEvent('select', { id: item.id, name: item.name })
    }
  }
})
