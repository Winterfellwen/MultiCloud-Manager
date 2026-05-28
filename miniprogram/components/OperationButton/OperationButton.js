Component({
  properties: {
    text: { type: String, value: '' },
    type: { type: String, value: 'default' },
    disabled: { type: Boolean, value: false }
  },

  data: {},

  attached: function() {
    var i18n = require('../../utils/i18n')
    if (!this.properties.text) {
      this.setData({ text: i18n.t('op_button.default') })
    }
  },

  methods: {
    onTap() {
      if (!this.properties.disabled) {
        this.triggerEvent('click')
      }
    }
  }
})
