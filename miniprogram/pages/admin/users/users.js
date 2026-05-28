const i18n = require('../../../utils/i18n')
const API = require('../../../utils/api')

Page({
  data: {
    users: [],
    theme: 'dark',
    lang: {},
    roleLabels: { admin: '', operator: '', viewer: '' },
    roleOptions: ['Admin', 'Operator', 'Viewer'],
    roleIndexMap: { admin: 0, operator: 1, viewer: 2 },
    roleValues: ['admin', 'operator', 'viewer'],
    showCreate: false,
    formUsername: '',
    formPassword: '',
    formNickname: '',
    formRoleIndex: 0,
    formError: '',
    formLoading: false
  },

  onLoad() {
    this.setLang()
    this.loadUsers()
  },

  onShow() {
    const app = getApp()
    this.setData({ theme: app.globalData.theme || 'dark' })
  },

  setLang() {
    const lang = i18n.getLangData([
      'admin.users_title', 'admin.add_user', 'admin.username', 'admin.password',
      'admin.nickname', 'admin.role', 'admin.create', 'admin.update',
      'admin.delete', 'admin.delete_confirm', 'admin.created', 'admin.deleted',
      'admin.updated', 'admin.search', 'admin.cancel',
      'user.role_admin', 'user.role_operator', 'user.role_viewer'
    ])
    this.setData({
      lang: lang,
      roleLabels: {
        admin: lang.user_role_admin,
        operator: lang.user_role_operator,
        viewer: lang.user_role_viewer
      },
      roleOptions: [lang.user_role_admin, lang.user_role_operator, lang.user_role_viewer]
    })
  },

  loadUsers() {
    API.get('/admin/users')
      .then(data => {
        this.setData({ users: data.users || [] })
      })
      .catch(() => {
        wx.showToast({ title: 'Failed to load users', icon: 'none' })
      })
  },

  onShowCreate() {
    this.setData({
      showCreate: true,
      formUsername: '',
      formPassword: '',
      formNickname: '',
      formRoleIndex: 0,
      formError: ''
    })
  },

  onHideCreate() {
    this.setData({ showCreate: false })
  },

  onFormUsername(e) { this.setData({ formUsername: e.detail.value }) },
  onFormPassword(e) { this.setData({ formPassword: e.detail.value }) },
  onFormNickname(e) { this.setData({ formNickname: e.detail.value }) },
  onFormRoleChange(e) { this.setData({ formRoleIndex: e.detail.value }) },

  onCreateUser() {
    const { formUsername, formPassword, formNickname, formRoleIndex, roleValues } = this.data
    if (!formUsername || !formPassword) {
      this.setData({ formError: 'Username and password required' })
      return
    }
    if (formPassword.length < 8) {
      this.setData({ formError: 'Password must be at least 8 characters' })
      return
    }

    this.setData({ formLoading: true, formError: '' })
    API.post('/admin/users', {
      username: formUsername,
      password: formPassword,
      nickname: formNickname || formUsername,
      role: roleValues[formRoleIndex]
    })
      .then(() => {
        wx.showToast({ title: this.data.lang.admin_created, icon: 'success' })
        this.setData({ showCreate: false })
        this.loadUsers()
      })
      .catch(err => {
        this.setData({ formError: err.message })
      })
      .finally(() => {
        this.setData({ formLoading: false })
      })
  },

  onRoleChange(e) {
    const userId = e.currentTarget.dataset.userId
    const role = this.data.roleValues[e.detail.value]

    API.put('/admin/users/' + userId, { role: role })
      .then(() => {
        wx.showToast({ title: this.data.lang.admin_updated, icon: 'success' })
        this.loadUsers()
      })
      .catch(() => {
        wx.showToast({ title: 'Update failed', icon: 'none' })
      })
  },

  onDelete(e) {
    const userId = e.currentTarget.dataset.userId
    const nickname = e.currentTarget.dataset.nickname

    wx.showModal({
      title: this.data.lang.admin_delete,
      content: (this.data.lang.admin_delete_confirm || '').replace('{username}', nickname),
      success: (res) => {
        if (res.confirm) {
          API.delete('/admin/users/' + userId)
            .then(() => {
              wx.showToast({ title: this.data.lang.admin_deleted, icon: 'success' })
              this.loadUsers()
            })
            .catch(() => {
              wx.showToast({ title: 'Delete failed', icon: 'none' })
            })
        }
      }
    })
  }
})
