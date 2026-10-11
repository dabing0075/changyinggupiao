const { INDICES, tierOf, tempOf, effPctOf, buildReminders, fmtWan } = require('./strategy')

function today() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// 生成当日消息候选（msg_key 按天去重，云端唯一约束保证不重复入库）
function buildMessageCandidates({ holdings, settings, market, watchlist, trades }) {
  const date = today()
  const msgs = []
  const bySymbol = (market && market.bySymbol) || {}
  const byDigits = (market && market.byDigits) || {}

  // 1) 组合级提醒（仓位/红线/再平衡，基于持仓+指数行情合并估值；红利取PE与股息率换算后大者）
  const merged = (holdings || []).map((h) => {
    const cfg = INDICES.find((i) => i.symbol === h.symbol)
    const m = cfg ? bySymbol[cfg.indexCode] : null
    const base = h.valuation_pct !== null && h.valuation_pct !== undefined
      ? h.valuation_pct
      : (m && m.valuation_pct !== null && m.valuation_pct !== undefined ? m.valuation_pct : null)
    return { ...h, valuation_pct: effPctOf(cfg, base, m && m.dividend_pct) }
  })
  buildReminders(merged, settings).forEach((r) => {
    msgs.push({
      msg_key: date + ':portfolio:' + r.kind + ':' + (r.symbol || 'all'),
      title: r.title, detail: r.detail, level: r.level,
    })
  })

  // 2) 八大标的：指数估值档位信号 + ETF网格触发
  INDICES.forEach((cfg) => {
    const idx = bySymbol[cfg.indexCode]
    // 估值档位信号（按指数分位；红利按 PE分位×10% + (100−股息率分位)×90% 加权）
    const idxPct = idx && idx.valuation_pct !== null && idx.valuation_pct !== undefined ? Number(idx.valuation_pct) : null
    const effPct = idx ? effPctOf(cfg, idxPct, idx.dividend_pct) : null
    if (effPct !== null) {
      const tier = tierOf(effPct)
      const dyNote = cfg.symbol === 'dividend' && idx.dividend_yield !== null && idx.dividend_yield !== undefined
        ? '（PE分位' + idxPct + '%，股息率' + idx.dividend_yield + '%、股息率分位'
          + (idx.dividend_pct !== null && idx.dividend_pct !== undefined ? idx.dividend_pct + '%' : '--')
          + '，加权有效分位' + effPct + '%）'
        : '（' + effPct + '%）'
      if (tier && tier.key === 'low') {
        msgs.push({
          msg_key: date + ':tier:' + cfg.symbol,
          title: cfg.indexName + '进入低估区间' + dyNote,
          detail: '有效分位≤30%，' + cfg.lowText + '。指数点位 ' + idx.price + '（' + (idx.change_pct >= 0 ? '+' : '') + idx.change_pct + '%），交易标的相关ETF。',
          level: 1,
        })
      } else if (tier && tier.key === 'over') {
        msgs.push({
          msg_key: date + ':tier:' + cfg.symbol,
          title: cfg.indexName + '进入高估区间' + dyNote,
          detail: '有效分位>85%，' + cfg.overText + '。' + (cfg.type === 'satellite' ? '行业网格应关闭，全部止盈。' : '核心底仓只降仓不清仓。'),
          level: 1,
        })
      }
    }
    // 网格触发：ETF现价越过 锚点±步长
    const m = bySymbol[cfg.etfCode]
    const h = (holdings || []).find((x) => x.symbol === cfg.symbol)
    const lastTrade = (trades || []).find((t) => t.symbol === cfg.symbol && t.price)
    const anchor = lastTrade ? Number(lastTrade.price) : (h && h.price ? Number(h.price) : null)
    if (anchor && m && m.price) {
      const price = Number(m.price)
      const step = cfg.gridStep / 100
      if (price <= anchor * (1 - step)) {
        msgs.push({
          msg_key: date + ':grid:buy:' + cfg.symbol + ':' + anchor,
          title: cfg.name + 'ETF触及网格买点 ' + (anchor * (1 - step)).toFixed(3),
          detail: '现价 ' + price + '，较锚点 ' + anchor + ' 下跌超 ' + cfg.gridStep + '%，按网格计划买入一格（底仓已建好的前提下）。',
          level: 1,
        })
      } else if (price >= anchor * (1 + step)) {
        msgs.push({
          msg_key: date + ':grid:sell:' + cfg.symbol + ':' + anchor,
          title: cfg.name + 'ETF触及网格卖点 ' + (anchor * (1 + step)).toFixed(3),
          detail: '现价 ' + price + '，较锚点 ' + anchor + ' 上涨超 ' + cfg.gridStep + '%，按网格计划卖出一格。',
          level: 1,
        })
      }
    }
  })

  // 3) 关注标的：触及支撑 / 压力位
  ;(watchlist || []).forEach((w) => {
    const digits = String(w.code || '').replace(/[a-zA-Z]/g, '')
    // 兼容港股代码位数差异（如列表存 0700，行情库存 00700）
    const m = byDigits[digits] || byDigits[digits.padStart(5, '0')] || byDigits[w.code]
    if (!m || !m.price) return
    const price = Number(m.price)
    const support = Number(w.support)
    const resistance = Number(w.resistance)
    if (!isNaN(support) && support > 0 && price <= support * 1.005) {
      msgs.push({
        msg_key: date + ':watch:support:' + w.code,
        title: w.name + '触及支撑位 ' + w.support,
        detail: '现价 ' + price + '，已贴近支撑 ' + w.support + '。原操作提示：' + (w.tip || '—'),
        level: 1,
      })
    }
    if (!isNaN(resistance) && resistance > 0 && price >= resistance * 0.995) {
      msgs.push({
        msg_key: date + ':watch:resist:' + w.code,
        title: w.name + '触及压力位 ' + w.resistance,
        detail: '现价 ' + price + '，已贴近压力 ' + w.resistance + '。原操作提示：' + (w.tip || '—'),
        level: 1,
      })
    }
  })

  return msgs
}

// 更新底部「我的」角标（tabBar 第5位，消息已合并进我的页）
// 注意：wx.setTabBarBadge/removeTabBarBadge 不返回 Promise，不能用 .catch，需用 fail 回调
function refreshTabBadge(count) {
  try {
    if (count > 0) {
      wx.setTabBarBadge({ index: 4, text: String(count > 99 ? '99+' : count), fail: () => {} })
    } else {
      wx.removeTabBarBadge({ index: 4, fail: () => {} })
    }
  } catch (e) { /* 忽略角标失败 */ }
}

module.exports = { buildMessageCandidates, refreshTabBadge, today }
