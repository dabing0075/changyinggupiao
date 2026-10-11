const store = require('../../utils/store')
const { tempOfPct } = require('../../utils/strategy')
const { loadMarket, isTradingHours, fmtTime } = require('../../utils/market')
const { buildMessageCandidates, refreshTabBadge } = require('../../utils/messages')
const { SUBSCRIBE_TMPL_ID } = require('../../utils/config')

Page({
  data: {
    session: null,
    loading: true,
    // 账户
    accounts: [],
    activeId: null,
    overview: null,
    newName: '',
    newCapital: '',
    adding: false,
    // 消息
    messages: [],
    marketTime: '',
    trading: false,
    syncing: false,
    syncError: '',
    accountsTotal: '0万',
    allActive: false,
  },

  onShow() {
    this.init()
    this.startPolling()
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
  },

  async init() {
    const session = await store.currentSession()
    this.setData({ session })
    if (!session) return
    this.loadAll()
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh())
  },

  startPolling() {
    this.stopPolling()
    this._timer = setInterval(() => {
      if (this.data.session) this.syncMessages({ silent: true })
    }, 60000)
  },

  stopPolling() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  async loadAll() {
    this.setData({ loading: true })
    try {
      const { account, accounts } = await store.activeAccount()
      this.setAccounts(accounts, account.id)
      await Promise.all([this.loadOverview(account), this.syncMessages({ silent: true, account })])
      this.setData({ loading: false })
    } catch (e) {
      console.error('[我的页加载失败]', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，请下拉重试', icon: 'none' })
    }
  },

  // 给每个账户预计算选中标记（WXML 不支持 String() 等函数调用，比较必须在 JS 侧完成）
  mapAccounts(accounts, activeId) {
    return (accounts || []).map((a) => ({ ...a, active: String(a.id) === String(activeId) }))
  },

  // 设置账户列表并计算账户总计
  setAccounts(accounts, activeId) {
    const id = activeId !== undefined ? activeId : this.data.activeId
    const total = (accounts || []).reduce((s, a) => s + Number(a.total_capital || 0), 0)
    this.setData({
      accounts: this.mapAccounts(accounts, id),
      activeId: id,
      allActive: String(id) === store.ALL_ACCOUNTS_ID,
      accountsTotal: (Math.round(total / 100) / 100) + '万',
    })
  },

  // 账户总览：资金/温度计/权益/现金
  async loadOverview(account) {
    const [holdings, market] = await Promise.all([store.loadHoldings(account.id), loadMarket()])
    const marketRow = market.bySymbol['sh000985']
    const temp = tempOfPct(marketRow && marketRow.valuation_pct !== null && marketRow.valuation_pct !== undefined
      ? Number(marketRow.valuation_pct) : null)
    const total = Number(account.total_capital || 0)
    const equityNow = holdings.reduce((s, h) => s + Number(h.current_amount || 0), 0)
    const capRatio = store.getEquityRatio(account.id) || temp.equityCap
    this.setData({
      overview: {
        name: account.name,
        total: (total / 10000) + '万',
        tempLabel: temp.label,
        equityCap: (total * capRatio / 10000) + '万',
        equityNow: (equityNow / 10000) + '万',
        cash: (Math.max(total - equityNow, 0) / 10000) + '万',
        ratio: total > 0 ? Math.round(equityNow / total * 100) : 0,
        capPct: Math.round(capRatio * 100),
      },
    })
  },

  // 生成并加载当前账户消息（账户总计时逐账户生成、汇总展示）
  async syncMessages(opts) {
    const silent = opts && opts.silent
    let account = opts && opts.account
    let stage = 'init'
    if (!silent) this.setData({ syncing: true, syncError: '' })
    try {
      if (!account) {
        stage = 'activeAccount'
        const r = await store.activeAccount()
        account = r.account
      }
      stage = 'watchlist/market'
      const [watchlist, market] = await Promise.all([store.loadWatchlist(), loadMarket()])
      // 与总览页同一口径：全市场温度自动判定 + 该账户点选的权益占比
      const mRow = (market.bySymbol || {})['sh000985']
      const mTemp = tempOfPct(mRow && mRow.valuation_pct !== null && mRow.valuation_pct !== undefined
        ? Number(mRow.valuation_pct) : null)
      const enrich = (acc) => ({
        ...acc,
        market_temp: mTemp.key,
        equity_cap: store.getEquityRatio(acc.id) || mTemp.equityCap,
      })
      if (account._all) {
        stage = 'loadAccounts'
        const accounts = await store.loadAccounts()
        for (const acc of accounts) {
          stage = 'gen:' + acc.id
          const [holdings, trades] = await Promise.all([
            store.loadHoldings(acc.id), store.loadTrades(acc.id),
          ])
          const candidates = buildMessageCandidates({ holdings, settings: enrich(acc), market, watchlist, trades })
            .map((m) => ({ ...m, account_id: acc.id }))
          await store.upsertMessages(candidates, acc.id)
        }
      } else {
        stage = 'gen:' + account.id
        const [holdings, trades] = await Promise.all([
          store.loadHoldings(account.id), store.loadTrades(account.id),
        ])
        const candidates = buildMessageCandidates({ holdings, settings: enrich(account), market, watchlist, trades })
          .map((m) => ({ ...m, account_id: account.id }))
        await store.upsertMessages(candidates, account.id)
      }
      stage = 'loadMessages'
      const [messages, unread] = await Promise.all([
        store.loadMessages(account.id), store.unreadCount(account.id),
      ])
      const latest = (market.list || []).reduce((acc, r) => (r.updated_at > acc ? r.updated_at : acc), '')
      this.setData({
        syncing: false,
        syncError: '',
        messages: (messages || []).map((m) => ({
          ...m,
          timeText: fmtTime(m.created_at),
          levelText: m.level === 1 ? '重要' : '提示',
        })),
        marketTime: fmtTime(latest),
        trading: isTradingHours(),
        unread,
      })
      refreshTabBadge(unread)
    } catch (e) {
      console.error('[消息同步失败@' + stage + ']', e)
      this.setData({
        syncing: false,
        syncError: '同步失败(' + stage + ')：' + ((e && e.message) || String(e)),
      })
    }
  },

  // ─── 账户操作 ───

  async onSwitchAccount(e) {
    const { id } = e.currentTarget.dataset
    if (String(id) === String(this.data.activeId)) return
    store.setActiveAccountId(id)
    const account = this.data.accounts.find((a) => String(a.id) === String(id))
    this.setData({
      activeId: account.id,
      allActive: false,
      accounts: this.mapAccounts(this.data.accounts, account.id),
      messages: [], overview: null,
    })
    wx.showToast({ title: '已切换到「' + account.name + '」', icon: 'none' })
    await Promise.all([this.loadOverview(account), this.syncMessages({ silent: true, account })])
  },

  // 选中「账户总计」：总览/消息按所有账户汇总展示
  async onSwitchAll() {
    if (String(this.data.activeId) === store.ALL_ACCOUNTS_ID) return
    store.setActiveAccountId(store.ALL_ACCOUNTS_ID)
    const account = store.aggregateAccount(this.data.accounts)
    this.setData({
      activeId: store.ALL_ACCOUNTS_ID,
      allActive: true,
      accounts: this.mapAccounts(this.data.accounts, store.ALL_ACCOUNTS_ID),
      messages: [], overview: null,
    })
    wx.showToast({ title: '已切换到「账户总计」', icon: 'none' })
    await Promise.all([this.loadOverview(account), this.syncMessages({ silent: true, account })])
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value })
  },

  onNewCapital(e) {
    this.setData({ newCapital: e.detail.value })
  },

  async onAddAccount() {
    const name = (this.data.newName || '').trim()
    const capital = Number(this.data.newCapital)
    if (!name) {
      wx.showToast({ title: '请输入账户名称', icon: 'none' })
      return
    }
    if (!capital || capital <= 0) {
      wx.showToast({ title: '请输入正确的资金总额', icon: 'none' })
      return
    }
    if (this.data.adding) return
    this.setData({ adding: true })
    try {
      const created = await store.createAccount(name, capital)
      await store.loadHoldings(created.id) // 为新账户播种六大标的
      const accounts = await store.loadAccounts()
      this.setAccounts(accounts)
      this.setData({ newName: '', newCapital: '', adding: false })
      wx.showToast({ title: '账户已创建', icon: 'none' })
    } catch (e2) {
      this.setData({ adding: false })
      wx.showToast({ title: '创建失败，请重试', icon: 'none' })
    }
  },

  onEditCapital(e) {
    const { id, name, capital } = e.currentTarget.dataset
    wx.showModal({
      title: '修改「' + name + '」资金总额',
      editable: true,
      placeholderText: '当前：' + capital + ' 元',
      success: async (r) => {
        if (!r.confirm) return
        const v = Number(r.content)
        if (!v || v <= 0) {
          wx.showToast({ title: '金额不正确', icon: 'none' })
          return
        }
        try {
          await store.saveAccount(id, { total_capital: v })
          const accounts = await store.loadAccounts()
          this.setAccounts(accounts)
          const active = String(this.data.activeId) === store.ALL_ACCOUNTS_ID
            ? store.aggregateAccount(accounts)
            : accounts.find((a) => String(a.id) === String(this.data.activeId))
          if (active) this.loadOverview(active)
          wx.showToast({ title: '已保存', icon: 'none' })
        } catch (e2) {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      },
    })
  },

  onDeleteAccount(e) {
    const { id, name } = e.currentTarget.dataset
    if (this.data.accounts.length <= 1) {
      wx.showToast({ title: '至少保留一个账户', icon: 'none' })
      return
    }
    wx.showModal({
      title: '删除账户「' + name + '」？',
      content: '该账户下的持仓、交易记录和消息将一并删除，且不可恢复。',
      confirmColor: '#c0392b',
      confirmText: '确认删除',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await store.deleteAccount(id)
          const accounts = await store.loadAccounts()
          let activeId = this.data.activeId
          if (String(id) === String(activeId)) {
            activeId = accounts[0].id
            store.setActiveAccountId(activeId)
          }
          this.setAccounts(accounts, activeId)
          const active = String(activeId) === store.ALL_ACCOUNTS_ID
            ? store.aggregateAccount(accounts)
            : accounts.find((a) => String(a.id) === String(activeId))
          await Promise.all([this.loadOverview(active), this.syncMessages({ silent: true, account: active })])
          wx.showToast({ title: '已删除', icon: 'none' })
        } catch (e2) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      },
    })
  },

  // ─── 消息操作 ───

  async onTapMessage(e) {
    const { id, read, msgKey } = e.currentTarget.dataset
    if (read) return
    try {
      // 同一内容的消息（多账户副本）一并标记已读
      await store.markReadByBaseKey(msgKey)
      const bk = store.msgBaseKey(msgKey)
      const messages = this.data.messages.map((m) => (
        m.id === id || store.msgBaseKey(m.msg_key) === bk ? { ...m, read: true } : m
      ))
      this.setData({ messages })
      refreshTabBadge(messages.filter((m) => !m.read).length)
    } catch (err) { /* 忽略标记失败 */ }
  },

  async onReadAll() {
    const unreadVisible = this.data.messages.filter((m) => !m.read).length
    if (unreadVisible === 0 && !(this.data.unread > 0)) return
    try {
      // 按账户范围直接更新数据库全部未读（含列表加载上限之外的历史未读）
      await store.markAllRead(this.data.activeId)
      const messages = this.data.messages.map((m) => ({ ...m, read: true }))
      this.setData({ messages, unread: 0 })
      refreshTabBadge(0)
      wx.showToast({ title: '已全部已读', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onManualRefresh() {
    this.syncMessages()
  },

  onSubscribe() {
    if (!SUBSCRIBE_TMPL_ID) {
      wx.showModal({
        title: '开启微信推送提醒',
        content: '小程序内消息已实时生效。如需锁屏也能收到的微信「服务通知」推送，需要先发布并绑定你的小程序账号，在微信公众平台申请订阅消息模板后，把模板ID填入 utils/config.js 的 SUBSCRIBE_TMPL_ID。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_TMPL_ID],
      success: (res) => {
        if (res[SUBSCRIBE_TMPL_ID] === 'accept') {
          wx.showToast({ title: '已开启推送提醒', icon: 'none' })
        } else {
          wx.showToast({ title: '已取消订阅授权', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '订阅授权失败', icon: 'none' }),
    })
  },

  goRules() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  },
})
