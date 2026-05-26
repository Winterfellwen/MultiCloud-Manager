Component({
  properties: {
    text: {
      type: String,
      value: '操作'
    },
    type: {
      type: String,
      value: 'default'
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },
  data: {},
  methods: {
    onTap() {
      if (!this.properties.disabled) {
        this.triggerEvent('click');
      }
    }
  }
})