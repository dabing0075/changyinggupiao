const store = require('../../utils/store')
const { INDICES, tierOf, tempOfPct, effPctOf, planFor } = require('../../utils/strategy')
const { loadMarket, isTradingHours, fmtTime } = require('../../utils/market')

Page({
  data: {
    session: null,
    loading: true,
    cards: [],
    equityCapAmount: 0,
    tempLabel: '',
    marketTime: '',
    trading: false,
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
      if (this.data.session && isTradingHours()) this.loadAll({ silent: true })
    }, 60000)
  },

  stopPolling() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  async loadAll(opts) {
    const silent = opts && opts.silent
    if (!silent) this.setData({ loading: true })
    try {
      const { account } = await store.activeAccount()
      const [holdings, trades, market] = await Promise.all([
        store.loadHoldings(account.id), store.loadTrades(account.id), loadMarket(),
      ])
      // 全市场温度自动判定（中证全指十年PE分位）
      const marketRow = market.bySymbol['sh000985']
      const temp = tempOfPct(marketRow && marketRow.valuation_pct !== null && marketRow.valuation_pct !== undefined
        ? Number(marketRow.valuation_pct) : null)
      const equityCapAmount = Number(account.total_capital || 0) * (store.getEquityRatio(account.id) || temp.equityCap)
      let latest = ''
      const cards = INDICES.map((cfg) => {
        const h = holdings.find((x) => x.symbol === cfg.symbol) || {}
        // 指数行情（点数 + 估值分位）
        const idx = market.bySymbol[cfg.indexCode]
        if (idx && idx.updated_at > latest) latest = idx.updated_at
        const idxPct = idx && idx.valuation_pct !== null && idx.valuation_pct !== undefined ? Number(idx.valuation_pct) : null
        const points = idx && idx.price ? Number(idx.price) : null
        const chg = idx && idx.change_pct !== null && idx.change_pct !== undefined ? Number(idx.change_pct) : null
        // 手工录入的分位兜底（指数行情缺失时）；红利指数取 PE分位 与 (100−股息率分位) 之大者
        const basePct = idxPct !== null
          ? idxPct
          : (h.valuation_pct !== null && h.valuation_pct !== undefined ? Number(h.valuation_pct) : null)
        const dyPct = idx && idx.dividend_pct !== null && idx.dividend_pct !== undefined ? Number(idx.dividend_pct) : null
        const effPct = effPctOf(cfg, basePct, dyPct)
        const plan = planFor(cfg, { ...h, valuation_pct: effPct }, equityCapAmount)
        // 网格参考：以当前指数点位为锚
        let grid = null
        if (points) {
          const step = cfg.gridStep / 100
          grid = {
            sellAt: Math.round(points * (1 + step)),
            buyAt: Math.round(points * (1 - step)),
            stepPct: cfg.gridStep,
          }
        }
        const actionColor = {
          buy: '#c0392b', dca: '#5b6b8c', stop: '#b26a00', reduce: '#1e8e3e', clear: '#1e8e3e', none: '#9a9a9a',
        }[plan.action]
        const peTier = tierOf(basePct)
        return {
          symbol: cfg.symbol,
          indexName: cfg.indexName, indexCode: cfg.indexCode,
          pos: cfg.pos,
          typeLabel: cfg.type === 'core' ? '核心底仓' : '卫星行业',
          pointsText: points !== null ? String(points) : '--',
          chgText: chg !== null ? (chg >= 0 ? '+' : '') + chg + '%' : '--',
          chgClass: chg !== null ? (chg >= 0 ? 'up' : 'down') : 'muted',
          // 十年PE分位：展示数据源原始值（红利不按加权替换）
          pctText: basePct !== null ? basePct + '%' : '--',
          pctColor: peTier ? peTier.color : '#9a9a9a',
          // 红利指数：股息率与股息率分位、加权有效分位
          dividend: cfg.symbol === 'dividend',
          effPctText: cfg.symbol === 'dividend' && effPct !== null ? effPct + '%' : '--',
          dyText: cfg.symbol === 'dividend' && idx && idx.dividend_yield !== null && idx.dividend_yield !== undefined
            ? idx.dividend_yield + '%' : '--',
          dyPctText: dyPct !== null ? dyPct + '%' : '--',
          plan, grid, actionColor,
          tierLabel: plan.tier ? plan.tier.label : '未更新',
          tierColor: plan.tier ? plan.tier.color : '#9a9a9a',
          tierBg: plan.tier ? plan.tier.bg : '#f2f2f2',
          redline: plan.tier && plan.tier.key !== 'low' && plan.tier.key !== 'fair',
        }
      })
      this.setData({
        cards, loading: false, equityCapAmount, tempLabel: temp.label,
        marketTime: fmtTime(latest), trading: isTradingHours(),
      })
    } catch (e) {
      this.setData({ loading: false })
      if (!silent) wx.showToast({ title: '加载失败，请下拉重试', icon: 'none' })
    }
  },
})
