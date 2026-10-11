const { cloud } = require('./utils/cloud')

App({
  globalData: {
    session: null,
  },
  onLaunch() {
    this.refreshSession()
  },
  async refreshSession() {
    try {
      const { data: session } = await cloud.auth.getSession()
      this.globalData.session = session || null
    } catch (e) {
      this.globalData.session = null
    }
    return this.globalData.session
  },
})
