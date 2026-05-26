Component({
  properties: {
    cloudList: {
      type: Array,
      value: [
        { id: 'azure', name: 'Azure', icon: '☁️' },
        { id: 'tencent', name: '腾讯云', icon: '🌐' },
        { id: 'oracle', name: 'Oracle Cloud', icon: '🔶' },
        { id: 'render', name: 'Render', icon: '⚡' }
      ]
    },
    selectedId: {
      type: String,
      value: ''
    }
  },

  data: {
    currentIndex: 0
  },

  methods: {
    onSelect(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.cloudList[index];
      this.setData({ currentIndex: index });
      this.triggerEvent('select', { id: item.id, name: item.name });
    }
  }
});
