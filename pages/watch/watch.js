const store = require('../../utils/store')
const { WATCHLIST_SNAPSHOT } = require('../../utils/watchlist-seed')
const { loadMarket, isTradingHours, fmtTime } = require('../../utils/market')
const { buildKeyPoints, KEY_POINTS_DATE } = require('../../utils/keypoints')

Page({
  data: {
    session: null,
    loading: true,
    items: [],
    keyPoints: [],
    kpDate: KEY_POINTS_DATE,
    importing: false,
    marketTime: '',
    trading: false,
    triggered: 0,
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

  async init() {
    const session = await store.currentSession()
    this.setData({ session })
    if (!session) return
    this.loadAll()
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh())
  },

  async loadAll(opts) {
    const silent = opts && opts.silent
    if (!silent) this.setData({ loading: true })
    try {
      const [rows, market] = await Promise.all([store.loadWatchlist(), loadMarket()])
      let latest = ''
      let triggered = 0
      const items = (rows || []).map((r) => {
        const digits = String(r.code || '').replace(/[a-zA-Z]/g, '')
        // 兼容港股代码位数差异（如列表存 0700，行情库存 00700）
        const m = market.byDigits[digits] || market.byDigits[digits.padStart(5, '0')] || market.byDigits[r.code]
        if (m && m.updated_at > latest) latest = m.updated_at
        const price = m && m.price ? Number(m.price) : r.price
        const change = m && m.change_pct !== null && m.change_pct !== undefined ? Number(m.change_pct) : r.change_pct
        const support = Number(r.support)
        const resistance = Number(r.resistance)
        // 状态：触及支撑（低吸区）/ 触及压力（减仓区）/ 正常
        let statusText = '正常'
        let statusCls = 'st-normal'
        if (!isNaN(support) && support > 0 && price !== null && Number(price) <= support * 1.005) {
          statusText = '触及支撑·低吸区'
          statusCls = 'st-buy'
          triggered += 1
        } else if (!isNaN(resistance) && resistance > 0 && price !== null && Number(price) >= resistance * 0.995) {
          statusText = '触及压力·减仓区'
          statusCls = 'st-sell'
          triggered += 1
        }
        return {
          ...r,
          priceText: price !== null && price !== undefined ? String(price) : '--',
          changeText: change !== null && change !== undefined ? (Number(change) >= 0 ? '+' : '') + change + '%' : '--',
          changeClass: Number(change) >= 0 ? 'up' : 'down',
          buyText: r.support ? '≤' + r.support : '',
          sellText: r.resistance ? '≥' + r.resistance : '',
          statusText, statusCls,
        }
      })
      this.setData({
        loading: false, items, marketTime: fmtTime(latest), trading: isTradingHours(), triggered,
        keyPoints: buildKeyPoints(market),
      })
    } catch (e) {
      this.setData({ loading: false })
      if (!silent) wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async onImport() {
    if (this.data.importing) return
    this.setData({ importing: true })
    try {
      await store.importWatchlist(WATCHLIST_SNAPSHOT.map((s) => ({ ...s })))
      wx.showToast({ title: '已导入17只标的', icon: 'none' })
      this.loadAll()
    } catch (e) {
      wx.showToast({ title: '导入失败', icon: 'none' })
    } finally {
      this.setData({ importing: false })
    }
  },
})
