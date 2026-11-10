// E大（ETF拯救世界）长赢指数体系 · 策略引擎
// 规则来源：《基于E大长赢指数体系的组合实操策略》《E大指数估值档位买卖对照表》
//
// 估值口径说明（重要）：
//   basis='equal' → ETF.run 等权PE分位（复刻 E大全市场估值图口径，历史区间更宽、分位整体偏低）
//   basis='cap'   → 理杏仁/韭圈儿 市值加权PE分位（沿用原有阈值）
// 两种口径的分位数值不可直接比较，因此分档阈值按口径分别设定（见 VALUATION_BANDS）。
// 红利指数在 equal 口径下按股息率绝对水位分档（E大对红利以股息率为主，见 DIVIDEND_YIELD_BANDS）。

// 八大组合标的（权益总仓内部目标占比：红利50/A500 30/创业板5/医药5/消费6/中概4；信息、恒生科技目标0仅跟踪）
// capWeight = 标的在权益中的上限占比（实际占总资金比例 > capWeight × 权益占比时触发超限预警）
// valuationBasis = 该指数估值分位的数据口径（equal / cap）
// 估值跟踪对应指数（指数点数），实际交易标的是对应ETF
const INDICES = [
  {
    symbol: 'dividend', name: '红利指数', indexName: '中证红利', indexCode: 'sh000922',
    code: '515180', etfCode: 'sh515180', type: 'core',
    targetWeight: 50, capWeight: 50, addStep: 4, gridStep: 5, valuationBasis: 'equal',
    pos: '压舱石·防御·吃股息',
    lowText: '每跌4%加1份，可加到仓位上限',
    fairText: '每月固定小额定投，不激进加仓',
    highText: '停止新增买入，持有不动',
    overText: '分批降仓，保留基础底仓不清仓',
  },
  {
    symbol: 'a500', name: '中证A500', indexName: '中证A500', indexCode: 'sh000510',
    code: '563800', etfCode: 'sh563800', type: 'core',
    targetWeight: 30, capWeight: 60, addStep: 5, gridStep: 5, valuationBasis: 'equal',
    pos: '均衡宽基·核心底仓',
    lowText: '每跌5%加1份，金字塔加至上限',
    fairText: '定期分批建仓',
    highText: '停止新增买入，持有',
    overText: '分批减仓，降低权重',
  },
  {
    symbol: 'chinext', name: '创业板指数', indexName: '创业板指', indexCode: 'sz399006',
    code: '159915', etfCode: 'sz159915', type: 'core',
    targetWeight: 5, capWeight: 10, addStep: 6, gridStep: 7, valuationBasis: 'equal',
    pos: '进攻宽基·高波动（仓位上限严格锁定）',
    lowText: '每跌6%加1份（波动大，间隔放大）',
    fairText: '小额定投',
    highText: '停止新增买入',
    overText: '大幅减仓，优先降仓',
  },
  {
    symbol: 'medicine', name: '医药指数', indexName: '全指医药', indexCode: 'sh000991',
    code: '159938', etfCode: 'sz159938', type: 'satellite',
    targetWeight: 5, capWeight: 5, addStep: 5, gridStep: 7, valuationBasis: 'equal',
    pos: '卫星·周期估值修复',
    lowText: '每跌5%加一笔，到上限停止',
    fairText: '持有，不新增',
    highText: '停止买入',
    overText: '分批止盈，清仓',
  },
  {
    symbol: 'consumer', name: '消费指数', indexName: '中证消费', indexCode: 'sh000932',
    code: '510150', etfCode: 'sh510150', type: 'satellite',
    targetWeight: 6, capWeight: 6, addStep: 5, gridStep: 7, valuationBasis: 'equal',
    pos: '卫星·慢周期',
    lowText: '每跌5%加一笔，到上限停止',
    fairText: '持有，不新增',
    highText: '停止买入',
    overText: '分批止盈，清仓',
  },
  {
    symbol: 'info', name: '信息指数', indexName: '全指信息', indexCode: 'sh000993',
    code: '159939', etfCode: 'sz159939', type: 'satellite',
    targetWeight: 0, capWeight: 5, addStep: 6, gridStep: 7, valuationBasis: 'equal',
    pos: '卫星·仅估值跟踪（目标持仓0）',
    lowText: '目标持仓为0，仅作估值观察',
    fairText: '目标持仓为0，仅作估值观察',
    highText: '目标持仓为0，仅作估值观察',
    overText: '目标持仓为0，仅作估值观察',
  },
  {
    symbol: 'china50', name: '中概互联网', indexName: '中国互联网50', indexCode: 'csH30533',
    code: '513050', etfCode: 'sh513050', type: 'satellite',
    targetWeight: 4, capWeight: 4, addStep: 6, gridStep: 7, valuationBasis: 'cap',
    pos: '卫星·海外互联网（汇率+政策双波动）',
    lowText: '每跌6%加一笔，到上限停止',
    fairText: '小额定投，持有',
    highText: '停止买入',
    overText: '分批止盈，清仓',
  },
  {
    symbol: 'hstech', name: '恒生科技', indexName: '恒生科技指数', indexCode: 'hkHSTECH',
    code: '513180', etfCode: 'sh513180', type: 'satellite',
    targetWeight: 0, addStep: 6, gridStep: 7, valuationBasis: 'cap',
    pos: '卫星·仅估值跟踪（目标持仓0）',
    lowText: '目标持仓为0，仅作估值观察',
    fairText: '目标持仓为0，仅作估值观察',
    highText: '目标持仓为0，仅作估值观察',
    overText: '目标持仓为0，仅作估值观察',
  },
]

// 分档阈值（按口径区分）：分位 < lowMax = 低估；< fairMax = 合理；<= highMax = 偏高；否则高估
// equal：ETF.run 等权PE分位口径 —— 历史区间更宽、分位普遍偏低，阈值相应下移
// cap：理杏仁/韭圈儿 市值加权PE分位口径 —— 沿用原有阈值
const VALUATION_BANDS = {
  equal: { lowMax: 25, fairMax: 60, highMax: 80 },
  cap: { lowMax: 30, fairMax: 70, highMax: 85 },
}

// 估值档位（展示用）
const TIERS = {
  low: { key: 'low', label: '低估', color: '#c0392b', bg: '#fdeceb' },
  fair: { key: 'fair', label: '合理', color: '#5b6b8c', bg: '#eef1f7' },
  high: { key: 'high', label: '偏高', color: '#b26a00', bg: '#fdf6ec' },
  over: { key: 'over', label: '高估', color: '#1e8e3e', bg: '#e8f5ec' },
}

// 红利指数股息率绝对水位（E大口径：股息率越高越便宜）
const DIVIDEND_YIELD_BANDS = [
  { min: 5, key: 'low' },
  { min: 4, key: 'low' },
  { min: 3, key: 'fair' },
  { min: 2.5, key: 'high' },
  { min: -1e9, key: 'over' },
]

// 全市场估值温度计 → 权益仓位上限
const MARKET_TEMPS = [
  { key: 'deep_low', label: '极度低估', equityCap: 0.8, desc: '权益最高80%，现金/债券20%（不允许满仓）' },
  { key: 'fair', label: '合理估值', equityCap: 0.6, desc: '权益60%，现金40%' },
  { key: 'high', label: '偏高估值', equityCap: 0.4, desc: '权益40%，现金60%' },
  { key: 'deep_high', label: '极度高估', equityCap: 0.2, desc: '权益压缩到20%以内，大量持有现金短债' },
]

function bandsOf(basis) {
  return VALUATION_BANDS[basis] || VALUATION_BANDS.cap
}

// pct 为「估值贵的程度」同向分位（0=最便宜，100=最贵）
function tierOf(pct, basis) {
  if (pct === null || pct === undefined || isNaN(pct)) return null
  const b = bandsOf(basis)
  if (pct < b.lowMax) return TIERS.low
  if (pct < b.fairMax) return TIERS.fair
  if (pct <= b.highMax) return TIERS.high
  return TIERS.over
}

// 档位区间文本（按口径生成，供对照表/说明使用）
function tierRangeText(key, basis) {
  const b = bandsOf(basis)
  switch (key) {
    case 'low': return '≤' + b.lowMax + '%'
    case 'fair': return b.lowMax + '~' + b.fairMax + '%'
    case 'high': return b.fairMax + '~' + b.highMax + '%'
    default: return '>' + b.highMax + '%'
  }
}

// 红利指数：股息率绝对水位 → 档位（股息率越高越便宜）
// 注意：数据源偶发把股息率返回 0（全站异常特征），此时视为无效，回退到估值分位判定，
// 否则会把红利误判成「高估」并触发止盈提醒。
function tierFromDividendYield(dy) {
  if (dy === null || dy === undefined || isNaN(Number(dy))) return null
  const v = Number(dy)
  if (v <= 0) return null
  const hit = DIVIDEND_YIELD_BANDS.find((b) => v >= b.min)
  return TIERS[hit ? hit.key : 'fair']
}

// 红利指数：档位对应的股息率水位区间文案（红利按股息率分档，不按分位区间显示）
function dividendRangeText(dy) {
  const v = Number(dy)
  if (dy === null || dy === undefined || isNaN(v) || v <= 0) return '股息率水位'
  if (v >= 5) return '股息率 ≥5%'
  if (v >= 4) return '股息率 4~5%'
  if (v >= 3) return '股息率 3~4%'
  if (v >= 2.5) return '股息率 2.5~3%'
  return '股息率 <2.5%'
}

// 档位判定入口：红利优先按股息率水位；其余按该指数口径的估值分位
function tierFor(cfg, holding) {
  if (!cfg) return null
  const rawPct = holding && holding.valuation_pct !== null && holding.valuation_pct !== undefined
    ? Number(holding.valuation_pct) : null
  if (cfg.symbol === 'dividend') {
    const dy = holding && holding.dividend_yield !== null && holding.dividend_yield !== undefined
      ? Number(holding.dividend_yield) : null
    const dyTier = tierFromDividendYield(dy)
    // 股息率为 0 属数据源异常，此时回退到估值分位，避免误判高估
    if (dyTier && !(dy !== null && dy <= 0)) return dyTier
  }
  return tierOf(rawPct, cfg.valuationBasis)
}

function tempOf(key) {
  return MARKET_TEMPS.find((t) => t.key === key) || MARKET_TEMPS[1]
}

// 全市场温度自动判定：按全市场指数（中证全指）十年PE分位映射四档
function tempOfPct(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return MARKET_TEMPS[1]
  if (pct < 30) return MARKET_TEMPS[0]
  if (pct < 70) return MARKET_TEMPS[1]
  if (pct <= 85) return MARKET_TEMPS[2]
  return MARKET_TEMPS[3]
}

// 有效估值分位：估值分位已由云端按各指数口径直接给出（equal=ETF.run 等权分位 / cap=加权分位），
// 故此处不再做加权换算，直接返回原值；红利的股息率维度改由 tierFromDividendYield 单独判定。
// 保留函数签名仅为兼容既有调用点。
function effPctOf(cfg, pePct, dyPct) {
  const pe = pePct !== null && pePct !== undefined && !isNaN(Number(pePct)) ? Number(pePct) : null
  if (pe !== null) return pe
  const dy = dyPct !== null && dyPct !== undefined && !isNaN(Number(dyPct)) ? 100 - Number(dyPct) : null
  return dy
}

function fmtWan(n) {
  if (n === null || n === undefined || isNaN(n)) return '--'
  const w = n / 10000
  return (Math.round(w * 100) / 100) + '万'
}

// 单标的操作计划
function planFor(cfg, holding, equityCapAmount) {
  const pct = holding && holding.valuation_pct !== null && holding.valuation_pct !== undefined
    ? Number(holding.valuation_pct) : null
  const tier = tierFor(cfg, holding)
  const current = holding ? Number(holding.current_amount || 0) : 0
  const target = equityCapAmount * cfg.targetWeight / 100
  const room = Math.max(target - current, 0)
  if (!tier) {
    return {
      action: 'none', level: 0,
      title: '待录入估值分位',
      detail: '每月初查询该指数十年PE估值分位后录入，系统将按档位生成操作提醒',
      tier: null, target, current, room,
    }
  }
  // 目标持仓为0的指数（如恒生科技）：只跟踪估值，不生成买卖计划
  if (!cfg.targetWeight) {
    return {
      action: 'none', level: 3,
      title: tier.label + ' · 仅估值跟踪',
      detail: '该指数目标持仓为0，仅作估值观察（当前分位' + pct + '%），不生成买卖计划。',
      tier, target, current, room: 0,
    }
  }
  switch (tier.key) {
    case 'low':
      return {
        action: 'buy', level: 1,
        title: '低估 · 分批买入',
        detail: cfg.lowText + '。距目标仓位还可投入约' + fmtWan(room) + '，金字塔加仓、越跌越加，但不一次梭哈。',
        tier, target, current, room,
      }
    case 'fair':
      return {
        action: 'dca', level: 3,
        title: '合理 · 小额定投',
        detail: cfg.fairText + '。目标仓位' + fmtWan(target) + '，当前' + fmtWan(current) + '。',
        tier, target, current, room,
      }
    case 'high':
      return {
        action: 'stop', level: 2,
        title: '偏高 · 停止新增买入',
        detail: cfg.highText + '。E大红线：估值>70%分位不再新增买入。',
        tier, target, current, room: 0,
      }
    case 'over':
      return {
        action: cfg.type === 'satellite' ? 'clear' : 'reduce', level: 1,
        title: cfg.type === 'satellite' ? '高估 · 分批止盈清仓' : '高估 · 分批降仓',
        detail: cfg.overText + '。当前持仓' + fmtWan(current) + '，建议分批兑现。',
        tier, target, current, room: 0,
      }
    default:
      return { action: 'none', level: 0, title: '--', detail: '', tier, target, current, room }
  }
}

// 组合级提醒列表（总览页用）
function buildReminders(holdings, settings) {
  const list = Array.isArray(holdings) ? holdings : []
  const totalCapital = settings ? Number(settings.total_capital || 0) : 0
  const temp = tempOf(settings ? settings.market_temp : 'fair')
  // 手动点选的权益占比优先于温度自动档
  const capRatio = settings && settings.equity_cap !== null && settings.equity_cap !== undefined
    ? Number(settings.equity_cap) : temp.equityCap
  const equityCapAmount = totalCapital * capRatio
  const equityNow = list.reduce((s, h) => s + Number(h.current_amount || 0), 0)
  const reminders = []

  // 1) 总仓位控制（保命规则）
  if (totalCapital > 0) {
    const ratio = equityNow / totalCapital
    if (ratio > capRatio + 0.02) {
      reminders.push({
        level: 1, kind: 'cap',
        title: '总权益仓位超标',
        detail: '当前权益占比' + Math.round(ratio * 100) + '%，高于权益上限'
          + Math.round(capRatio * 100) + '%，请减仓至上限内（' + fmtWan(equityCapAmount) + '）。',
      })
    }
    const cashMin = totalCapital * 0.05
    if (totalCapital - equityNow < cashMin) {
      reminders.push({
        level: 1, kind: 'cash',
        title: '现金弹药不足',
        detail: '现金/短债低于总资产5%（' + fmtWan(cashMin) + '），E大体系要求永远保留加仓弹药。',
      })
    }
  }

  // 2) 各标的估值档位 + 偏离度
  list.forEach((h) => {
    const cfg = INDICES.find((i) => i.symbol === h.symbol)
    if (!cfg) return
    const plan = planFor(cfg, h, equityCapAmount)
    if (plan.action === 'buy') {
      reminders.push({
        level: 1, kind: 'buy', symbol: h.symbol,
        title: cfg.name + '：低估买入窗口',
        detail: '估值分位' + h.valuation_pct + '%，' + plan.detail,
      })
    } else if (plan.action === 'clear' || plan.action === 'reduce') {
      reminders.push({
        level: 1, kind: 'sell', symbol: h.symbol,
        title: cfg.name + '：' + plan.title,
        detail: '估值分位' + h.valuation_pct + '%，' + plan.detail,
      })
    }
    // 单标的持仓上限预警：实际占总资金比例 > 标的在权益中的上限占比 × 权益占比
    if (totalCapital > 0 && cfg.capWeight && Number(h.current_amount) > 0) {
      const capLimit = cfg.capWeight * capRatio
      const actual = Number(h.current_amount) / totalCapital * 100
      if (actual > capLimit) {
        reminders.push({
          level: 1, kind: 'capover', symbol: h.symbol,
          title: cfg.name + '：超出持仓上限',
          detail: '实际占总资金' + actual.toFixed(1) + '%，高于上限比例' + (Math.round(capLimit * 10) / 10)
            + '%（权益内上限占比' + cfg.capWeight + '% × 权益占比' + Math.round(capRatio * 100) + '%），'
            + '超出约' + fmtWan((actual - capLimit) / 100 * totalCapital) + '，请减仓至上限内。',
        })
      }
    }
    // 偏离度再平衡（±5%）：实际持仓比例 = 持仓金额 ÷ 投资总资金；偏离 = 实际比例 − 目标比例（标的占比×权益占比）
    if (totalCapital > 0 && Number(h.current_amount) > 0) {
      const actual = Number(h.current_amount) / totalCapital * 100
      const targetRatio = cfg.targetWeight * capRatio
      const dev = actual - targetRatio
      if (Math.abs(dev) >= 5) {
        reminders.push({
          level: 2, kind: 'rebalance', symbol: h.symbol,
          title: cfg.name + '：仓位偏离' + (dev > 0 ? '+' : '') + dev.toFixed(1) + '%',
          detail: '实际占总资金' + actual.toFixed(1) + '% vs 目标' + (Math.round(targetRatio * 10) / 10) + '%，触发±5%再平衡：'
            + (dev > 0 ? '卖出超额部分约' + fmtWan((dev / 100) * totalCapital) + '，补仓低估标的。' : '该标的被低配，可在低估时优先补足。'),
        })
      }
    }
  })

  // 3) 卫星仓位红线（上限 = 卫星标的目标占比之和，随卫星数量动态变化）
  const satCfgs = INDICES.filter((i) => i.type === 'satellite')
  const satCap = satCfgs.reduce((s, c) => s + c.targetWeight, 0) / 100
  const satelliteNow = list
    .filter((h) => { const c = INDICES.find((i) => i.symbol === h.symbol); return c && c.type === 'satellite' })
    .reduce((s, h) => s + Number(h.current_amount || 0), 0)
  if (equityNow > 0 && satCap > 0 && satelliteNow / equityNow > satCap) {
    reminders.push({
      level: 1, kind: 'redline',
      title: '卫星仓位越线',
      detail: '卫星行业合计占权益' + Math.round(satelliteNow / equityNow * 100) + '%，超过' + Math.round(satCap * 100) + '%红线，请降卫星仓。',
    })
  }

  const order = { 1: 0, 2: 1, 3: 2 }
  reminders.sort((a, b) => (order[a.level] || 9) - (order[b.level] || 9))
  return reminders
}

module.exports = {
  INDICES, TIERS, VALUATION_BANDS, MARKET_TEMPS,
  tierOf, tierFor, tierRangeText, tierFromDividendYield, dividendRangeText, tempOf, tempOfPct, effPctOf,
  planFor, buildReminders, fmtWan,
}
