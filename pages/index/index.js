const store = require('../../utils/store')
const { INDICES, tierOf, tempOfPct, effPctOf, buildReminders, fmtWan } = require('../../utils/strategy')
const { loadMarket, fmtTime } = require('../../utils/market')
const { refreshTabBadge } = require('../../utils/messages')

Page({
  data: {
    session: null,
    loggingIn: false,
    loginError: '',
    loading: true,
    loadError: '',
    settings: null,
    holdings: [],
    rows: [],
    reminders: [],
    summary: { total: 0, equityCap: 0, equityNow: 0, cash: 0, ratio: 0 },
    marketTime: '',
    unread: 0,
    accountName: '',
    accountCount: 1,
    accountId: null,
    // 权益与现金占比四档选择（null=跟随市场温度自动）
    equityRatio: null,
    equityOn: 0.6,
    equityOptions: [
      { r: 0.8, equityText: '权益 80%', cashText: '现金 20%' },
      { r: 0.6, equityText: '权益 60%', cashText: '现金 40%' },
      { r: 0.4, equityText: '权益 40%', cashText: '现金 60%' },
      { r: 0.2, equityText: '权益 20%', cashText: '现金 80%' },
    ],
    fmtWan,
  },

  onShow() {
    this.init()
  },

  async init() {
    const session = await store.currentSession()
    this.setData({ session })
    if (!session) {
      this.setData({ loading: false })
      return
    }
    this.loadAll()
  },

  async onLogin() {
    if (this.data.loggingIn) return
    this.setData({ loggingIn: true, loginError: '' })
    try {
      const session = await store.wechatLogin()
      this.setData({ session, loggingIn: false })
      this.loadAll()
    } catch (e) {
      this.setData({ loggingIn: false, loginError: e.message || '登录失败，请重试' })
    }
  },

  async loadAll() {
    this.setData({ loading: true, loadError: '' })
    try {
      const { account, accounts } = await store.activeAccount()
      const [holdings, market] = await Promise.all([
        store.loadHoldings(account.id), loadMarket(),
      ])
      store.unreadCount(account.id).then((n) => {
        refreshTabBadge(n)
        this.setData({ unread: n })
      }).catch(() => {})
      this.setData({
        accountName: account.name,
        accountCount: accounts.length,
        accountId: account.id,
        equityRatio: store.getEquityRatio(account.id),
      })
      this._ctx = { settings: account, holdings, market }
      this.compute(account, holdings, market)
    } catch (e) {
      this.setData({ loading: false, loadError: '数据加载失败，请下拉重试' })
    }
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh())
  },

  // 点选权益占比档位
  onEquityChange(e) {
    const r = Number(e.currentTarget.dataset.r)
    if (!this.data.accountId || !(r > 0)) return
    store.setEquityRatio(this.data.accountId, r)
    this.setData({ equityRatio: r })
    wx.showToast({ title: '权益占比已设为' + Math.round(r * 100) + '%', icon: 'none' })
    if (this._ctx) this.compute(this._ctx.settings, this._ctx.holdings, this._ctx.market)
  },

  // 恢复跟随市场温度自动档
  onEquityAuto() {
    if (!this.data.accountId) return
    store.setEquityRatio(this.data.accountId, null)
    this.setData({ equityRatio: null })
    wx.showToast({ title: '已恢复自动', icon: 'none' })
    if (this._ctx) this.compute(this._ctx.settings, this._ctx.holdings, this._ctx.market)
  },

  compute(settings, holdings, market) {
    const bySymbol = (market && market.bySymbol) || {}
    let latest = ''
    Object.keys(bySymbol).forEach((k) => {
      if (bySymbol[k].updated_at > latest) latest = bySymbol[k].updated_at
    })
    // 指数行情补齐未手工录入的估值分位；红利指数取 PE分位 与 (100−股息率分位) 之大者
    const merged = holdings.map((h) => {
      const cfg = INDICES.find((i) => i.symbol === h.symbol)
      const m = cfg ? bySymbol[cfg.indexCode] : null
      const base = h.valuation_pct !== null && h.valuation_pct !== undefined
        ? h.valuation_pct
        : (m && m.valuation_pct !== null && m.valuation_pct !== undefined ? m.valuation_pct : null)
      return { ...h, valuation_pct: effPctOf(cfg, base, m && m.dividend_pct) }
    })
    // 全市场温度：按中证全指十年PE分位自动判定
    const marketRow = bySymbol['sh000985']
    const marketPct = marketRow && marketRow.valuation_pct !== null && marketRow.valuation_pct !== undefined
      ? Number(marketRow.valuation_pct) : null
    const temp = tempOfPct(marketPct)
    // 权益占比：手动点选优先，未点选则跟随市场温度自动档
    const capRatio = this.data.equityRatio || temp.equityCap
    const total = Number(settings.total_capital || 0)
    const equityCap = total * capRatio
    const equityNow = merged.reduce((s, h) => s + Number(h.current_amount || 0), 0)
    const rows = INDICES.map((cfg) => {
      const h = merged.find((x) => x.symbol === cfg.symbol) || {}
      const mIdx = bySymbol[cfg.indexCode] || null
      const current = Number(h.current_amount || 0)
      // 目标仓位金额 = 投资总资金 × 权益占比 × 标的在权益中的目标占比
      const capAmount = equityCap * cfg.targetWeight / 100
      const devAmount = current - capAmount
      // 实际持仓比例 = 实际持仓金额 ÷ 账户资产总金额；目标比例 = 标的在权益中的占比 × 权益占比
      const actual = total > 0 ? current / total * 100 : 0
      const targetRatio = cfg.targetWeight * capRatio
      const dev = actual - targetRatio
      // 上限比例 = 标的在权益中的上限占比 × 权益占比；实际比例超过上限即预警
      const capLimit = cfg.capWeight ? cfg.capWeight * capRatio : null
      const capWarn = capLimit !== null && actual > capLimit
      const tier = tierOf(h.valuation_pct !== null && h.valuation_pct !== undefined ? Number(h.valuation_pct) : null)
      const wan = (n) => Math.round(n / 100) / 100
      return {
        symbol: cfg.symbol, name: cfg.name, code: cfg.code, type: cfg.type,
        targetWeight: cfg.targetWeight, current,
        targetRatioText: (Math.round(targetRatio * 10) / 10) + '%',
        capText: wan(capAmount) + '万',
        currentText: wan(current) + '万',
        devAmtText: (devAmount >= 0 ? '+' : '') + wan(devAmount) + '万',
        devAmtWarn: Math.abs(dev) >= 5,
        actualText: total > 0 ? actual.toFixed(1) + '%' : '--',
        devText: total > 0 ? (dev >= 0 ? '+' : '') + dev.toFixed(1) + '%' : '--',
        devWarn: Math.abs(dev) >= 5,
        capLimitText: capLimit !== null ? (Math.round(capLimit * 10) / 10) + '%' : '—',
        capWarn,
        tierLabel: tier ? tier.label : '未录入',
        tierColor: tier ? tier.color : '#9a9a9a',
        tierBg: tier ? tier.bg : '#f2f2f2',
        pct: h.valuation_pct,
        // 红利指数附加股息率展示
        dyText: cfg.symbol === 'dividend' && mIdx && mIdx.dividend_yield !== null && mIdx.dividend_yield !== undefined
          ? '股息率' + mIdx.dividend_yield + '% · 分位'
            + (mIdx.dividend_pct !== null && mIdx.dividend_pct !== undefined ? mIdx.dividend_pct + '%' : '--')
          : '',
      }
    })
    const reminders = buildReminders(merged, { ...settings, market_temp: temp.key, equity_cap: capRatio })
    this.setData({
      loading: false,
      settings, holdings: merged, rows, reminders,
      marketTime: fmtTime(latest),
      market,
      equityOn: capRatio,
      summary: {
        total, equityCap, equityNow,
        cash: Math.max(total - equityNow, 0),
        ratio: total > 0 ? Math.round(equityNow / total * 100) : 0,
        capPct: Math.round(capRatio * 100),
        tempLabel: temp.label,
        tempDesc: temp.desc,
        tempPctText: marketPct !== null ? marketPct + '%' : '待更新',
      },
    })
  },

  goMessages() {
    wx.switchTab({ url: '/pages/me/me' })
  },
})
