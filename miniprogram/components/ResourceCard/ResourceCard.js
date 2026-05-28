Component({
  properties: {
    resourceName: { type: String, value: '' },
    platform: { type: String, value: '' },
    status: { type: String, value: '' },
    region: { type: String, value: '' },
    spec: { type: String, value: '' }
  },

  data: {},

  attached: function() {
    var i18n = require('../../utils/i18n')
    this.setData({ lang: i18n.getLangData(['resource_card.status', 'resource_card.region', 'resource_card.spec']) })
  },

  methods: {}
})
