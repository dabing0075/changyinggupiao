const store = require('../../utils/store')
const { INDICES, tierOf } = require('../../utils/strategy')

Page({
  data: {
    session: null,
    loading: true,
    accounts: [],
    accountNames: [],
    accountIdx: 0,
    names: INDICES.map((i) => i.name),
    indexIdx: 0,
    direction: 'buy',
    amount: '',
    price: '',
    pct: '',
    note: '',
    trades: [],
    holdings: [],
    saving: false,
  },

  onShow() {
    this.init()
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

  selectedAccount() {
    return this.data.accounts[this.data.accountIdx] || this.data.accounts[0]
  },

  async loadAll() {
    this.setData({ loading: true })
    try {
      const { account, accounts } = await store.activeAccount()
      // 保持当前选择；若所选账户已被删除则回落到「我的」页选中的账户
      let idx = this.data.accounts.length ? this.data.accountIdx : -1
      const prev = idx >= 0 ? this.data.accounts[idx] : null
      idx = prev ? accounts.findIndex((a) => String(a.id) === String(prev.id)) : -1
      if (idx < 0) idx = Math.max(accounts.findIndex((a) => String(a.id) === String(account.id)), 0)
      this.setData({
        accounts,
        accountNames: accounts.map((a) => a.name + '（' + (a.total_capital / 10000) + '万）'),
        accountIdx: idx,
      })
      await this.loadAccountData()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async loadAccountData() {
    const acc = this.selectedAccount()
    if (!acc) {
      this.setData({ loading: false })
      return
    }
    const [holdings, trades] = await Promise.all([
      store.loadHoldings(acc.id), store.loadTrades(acc.id),
    ])
    const rows = (trades || []).map((t) => ({
      ...t,
      timeText: (t.traded_at || '').replace('T', ' ').slice(0, 16),
      dirText: t.direction === 'buy' ? '买入' : (t.direction === 'sell' ? '卖出' : '持仓校准'),
      dirClass: t.direction === 'buy' ? 'up' : (t.direction === 'sell' ? 'down' : 'muted'),
    }))
    this.setData({ holdings, trades: rows, loading: false })
    this.syncPctFromHolding()
  },

  onAccountChange(e) {
    this.setData({ accountIdx: Number(e.detail.value), loading: true })
    this.loadAccountData().catch(() => {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  syncPctFromHolding() {
    const cfg = INDICES[this.data.indexIdx]
    const h = this.data.holdings.find((x) => x.symbol === cfg.symbol)
    if (h) {
      this.setData({
        pct: h.valuation_pct !== null && h.valuation_pct !== undefined ? String(h.valuation_pct) : '',
        price: this.data.price || (h.price ? String(h.price) : ''),
      })
    } else {
      this.setData({ pct: '', price: '' })
    }
  },

  onIndexChange(e) {
    this.setData({ indexIdx: Number(e.detail.value) }, () => this.syncPctFromHolding())
  },

  onDir(e) {
    this.setData({ direction: e.currentTarget.dataset.dir })
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },

  doSave() {
    const acc = this.selectedAccount()
    const cfg = INDICES[this.data.indexIdx]
    const amount = Number(this.data.amount)
    const price = this.data.price ? Number(this.data.price) : null
    const pct = this.data.pct !== '' ? Number(this.data.pct) : null
    const holding = this.data.holdings.find((x) => x.symbol === cfg.symbol)
    if (!holding) {
      this.setData({ saving: false })
      wx.showToast({ title: '持仓数据缺失，请重新进入页面', icon: 'none' })
      return
    }
    const isHold = this.data.direction === 'hold'
    // 买入加、卖出减、持仓直接以填写金额为准
    const delta = this.data.direction === 'buy' ? amount : (this.data.direction === 'sell' ? -amount : 0)
    const newAmount = isHold ? amount : Math.max(Number(holding.current_amount || 0) + delta, 0)
    this.setData({ saving: true })
    store.addTrade({
      account_id: acc.id,
      symbol: cfg.symbol, name: cfg.name,
      direction: this.data.direction, amount,
      price, valuation_pct: pct, note: this.data.note || null,
      traded_at: new Date().toISOString(),
    })
      .then(() => {
        const patch = { current_amount: newAmount }
        if (price) patch.price = price
        if (pct !== null) patch.valuation_pct = pct
        return store.saveHolding(holding.id, patch)
      })
      .then(() => {
        this.setData({ saving: false, amount: '', note: '' })
        wx.showToast({ title: isHold ? '持仓已校准到「' + acc.name + '」' : '已记账到「' + acc.name + '」', icon: 'none' })
        this.loadAccountData()
      })
      .catch((err) => {
        this.setData({ saving: false })
        wx.showToast({ title: err.message || '保存失败', icon: 'none' })
      })
  },

  onSave() {
    const amount = Number(this.data.amount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入正确金额', icon: 'none' })
      return
    }
    if (!this.selectedAccount()) {
      wx.showToast({ title: '请先在「我的」页创建账户', icon: 'none' })
      return
    }
    const pct = this.data.pct !== '' ? Number(this.data.pct) : null
    const tier = tierOf(pct)
    // E大红线校验：买入时估值>70%分位禁止新增
    if (this.data.direction === 'buy' && tier && (tier.key === 'high' || tier.key === 'over')) {
      wx.showModal({
        title: '红线提醒',
        content: 'E大体系红线：估值分位>70%不再新增买入。当前' + pct + '%分位，确认仍要记录这笔买入吗？',
        confirmText: '仍要记录',
        confirmColor: '#c0392b',
        success: (r) => { if (r.confirm) this.doSave() },
      })
      return
    }
    this.doSave()
  },

  onDelete(e) {
    const { id, symbol, direction, amount } = e.currentTarget.dataset
    const isHold = direction === 'hold'
    wx.showModal({
      title: '删除这笔记录？',
      content: isHold ? '持仓校准记录删除后不回滚持仓金额（原值无从恢复），仅删除该条记录。' : '将同时回滚该标的持仓金额。',
      confirmColor: '#c0392b',
      success: (r) => {
        if (!r.confirm) return
        const holding = this.data.holdings.find((x) => x.symbol === symbol)
        const ops = [store.deleteTrade(id)]
        if (!isHold && holding) {
          const rollback = direction === 'buy' ? -Number(amount) : Number(amount)
          const newAmount = Math.max(Number(holding.current_amount || 0) + rollback, 0)
          ops.push(store.saveHolding(holding.id, { current_amount: newAmount }))
        }
        Promise.all(ops)
          .then(() => this.loadAccountData())
          .catch(() => wx.showToast({ title: '删除失败', icon: 'none' }))
      },
    })
  },
})
