// E大『关键点位』· 点位笔记本地配置
// 数据来源：E大笔记「关键点位」图（2026-10-29，更新 23:10）
//   · 创业板R(399606) 大支撑 2100
//   · 沪深300(000300) 大支撑 3030~3230
//   · 中证500(000905) 大支撑 4800 / 大气层 8600
//   · A500(000510)    大支撑 3660~3900
//   · 红利100低波(930955) 第三支撑 9460~10050
//   · 中证医疗(399989) 大支撑 5900~6000
//   · 黄金TD(AUTD)    大支撑 700，分批区 810~850
//
// basePrice 为笔记当日点位；若云端 market_data 存在该 symbol 的实时行情，则以行情价为准。
// 色带规则（与笔记图一致）：青色=大支撑区 · 橙色=正常区 · 粉色=外太空区；
// 绿实线=大支撑位 · 红实线=大气层位 · 深色针=当下点位。

const KEY_POINTS_DATE = '2026-10-29'

const KEY_POINTS = [
  {
    symbol: 'sz399606', name: '创业板R', code: '399606',
    basePrice: 2814,
    supLow: 2100, supHigh: 2100, supLabel: '大支撑',
    sky: null, skyLabel: '外太空',
    note: '极限下跌约 6%，收盘价大概在 2100 左右',
  },
  {
    symbol: 'sh000300', name: '沪深300', code: '000300',
    basePrice: 4042,
    supLow: 3030, supHigh: 3230, supLabel: '大支撑',
    sky: null, skyLabel: '外太空',
    note: '极低估区间对应下跌 20%~25%',
  },
  {
    symbol: 'sh000905', name: '中证500', code: '000905',
    basePrice: 6454,
    supLow: 4800, supHigh: 4800, supLabel: '大支撑',
    sky: 8600, skyLabel: '大气层',
    note: '历史大支撑 4800；大气层压力位 8600 左右',
  },
  {
    symbol: 'sh000510', name: 'A500', code: '000510',
    basePrice: 4885,
    supLow: 3660, supHigh: 3900, supLabel: '大支撑',
    sky: null, skyLabel: '外太空',
    note: '成本点位 4885 对应下跌 20%~25% 即 3660~3900',
  },
  {
    symbol: 'sh930955', name: '红利100低波', code: '930955',
    basePrice: 11495,
    supLow: 9460, supHigh: 10050, supLabel: '第三支撑',
    // 该支撑区间锚定 2025-12-18 的笔记点位，随指数长期上行而逐年抬升
    supAsOf: '2025-12-18', supDriftPct: 4.5,
    sky: null, skyLabel: '外太空',
    note: '笔记原文提到大支撑 11200~11300，其下方看第三支撑；区间点位会随指数长期上行',
  },
  {
    symbol: 'sz399989', name: '中证医疗', code: '399989',
    basePrice: 6543,
    supLow: 5900, supHigh: 6000, supLabel: '大支撑',
    sky: null, skyLabel: '外太空',
    note: '5900~6000 附近继续买入，空间时间都够',
  },
  {
    symbol: 'AUTD', name: '黄金TD', code: 'AUTD',
    basePrice: 886,
    supLow: 700, supHigh: 700, supLabel: '大支撑',
    refLow: 810, refHigh: 850, refLabel: '分批区',
    sky: null, skyLabel: '外太空',
    note: '810~850 之间先触及一下，极端情况看 700 以下',
  },
]

// 数值格式化：保留至多两位小数并去掉多余的 0
function fmtNum(v) {
  if (v === null || v === undefined || isNaN(Number(v))) return '--'
  const n = Number(v)
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)
  return String(Number(s))
}

// 点位短日期：2026-11-10T19:05:31 → 11-10
function fmtAsOf(iso, fallback) {
  const s = String(iso || '')
  const hit = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!hit) return fallback || ''
  return hit[2] + '-' + hit[3]
}

function fmtPct(v) {
  if (v === null || v === undefined || isNaN(Number(v))) return '--'
  const n = Number(v)
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%'
}

// 色带左端留白系数：左端取大支撑下沿的 0.70，使青色段视觉宽度接近笔记图
const DOMAIN_LEFT_RATIO = 0.70
// 无大气层数值时，用当下点位 ×1.35 作为外太空起点估算
const SKY_FALLBACK_RATIO = 1.35
// 右端留白
const DOMAIN_RIGHT_RATIO = 1.10

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

// 支撑区间随时间上移：以笔记锚定日为起点，按年化百分比复利折算
// 返回相对锚定日的上移倍数（锚定日之前一律按 1 处理）
function driftFactor(asOf, annualPct, now) {
  if (!asOf || !annualPct) return 1
  const t0 = Date.parse(asOf + 'T00:00:00+08:00')
  if (isNaN(t0)) return 1
  const years = Math.max(0, ((now || Date.now()) - t0) / (365.25 * 24 * 3600 * 1000))
  return Math.pow(1 + annualPct / 100, years)
}

// 把关键点位配置 + 云端行情 → 页面卡片视图模型
function buildKeyPoints(market, now) {
  const bySymbol = (market && market.bySymbol) || {}
  const nowTs = now || Date.now()
  return KEY_POINTS.map((it) => {
    const m = bySymbol[it.symbol]
    const live = m && m.price !== null && m.price !== undefined && Number(m.price) > 0
      ? Number(m.price)
      : null
    const price = live !== null ? live : it.basePrice

    // 支撑区间按年化上移折算到当前日期
    const factor = driftFactor(it.supAsOf, it.supDriftPct, nowTs)
    const supLow = it.supLow * factor
    const supHigh = it.supHigh * factor

    const d0 = supLow * DOMAIN_LEFT_RATIO
    const skyPoint = it.sky || price * SKY_FALLBACK_RATIO
    const d1 = skyPoint * DOMAIN_RIGHT_RATIO
    const span = d1 - d0 || 1
    const pos = (v) => clamp(((Number(v) - d0) / span) * 100, 0, 100)

    const supEnd = pos(supHigh)
    const skyPos = pos(skyPoint)

    const segments = [
      { id: 's', cls: 'seg-support', width: Number(supEnd.toFixed(2)) },
      { id: 'f', cls: 'seg-fair', width: Number((skyPos - supEnd).toFixed(2)) },
      { id: 'o', cls: 'seg-over', width: Number((100 - skyPos).toFixed(2)) },
    ]

    const marks = [{ id: 'sup', cls: 'mark-sup', left: Number(supEnd.toFixed(2)) }]
    if (it.sky) marks.push({ id: 'sky', cls: 'mark-sky', left: Number(skyPos.toFixed(2)) })

    // 分批区（黄金TD 的 810~850）
    let band = null
    if (it.refLow && it.refHigh) {
      const a = pos(it.refLow)
      const b = pos(it.refHigh)
      band = { left: Number(a.toFixed(2)), width: Number(Math.max(b - a, 1.5).toFixed(2)) }
    }

    const toSup = ((supHigh - price) / price) * 100
    const toSky = it.sky ? ((it.sky - price) / price) * 100 : null

    // 标签贴边时改为左/右对齐，避免文字被裁切
    const alignOf = (left) => (left < 18 ? 'la-start' : left > 82 ? 'la-end' : 'la-center')
    const supLeft = Number(clamp(supEnd, 10, 90).toFixed(2))
    const skyLeft = it.sky ? Number(clamp(skyPos, 10, 90).toFixed(2)) : 0

    return {
      symbol: it.symbol,
      name: it.name,
      code: it.code,
      note: it.note,
      priceText: fmtNum(price),
      live,
      asOfText: live !== null ? fmtAsOf(m && m.updated_at, KEY_POINTS_DATE) : '笔记',
      priceLeft: Number(pos(price).toFixed(2)),
      toSupText: fmtPct(toSup),
      toSupCls: toSup < 0 ? 'kp-neg' : 'kp-pos',
      toSkyText: toSky !== null ? fmtPct(toSky) : '',
      toSkyCls: toSky !== null && toSky > 0 ? 'kp-pos' : 'kp-neg',
      segments,
      marks,
      band,
      supText: it.supLow === it.supHigh ? fmtNum(supLow) : fmtNum(supLow) + '~' + fmtNum(supHigh),
      supLabel: it.supLabel,
      // 支撑区间按年化上移时，显示一个提示标签
      supDriftText: it.supDriftPct
        ? '↑' + it.supDriftPct + '%/年'
        : '',
      supDriftTip: it.supDriftPct
        ? '锚定 ' + it.supAsOf + ' 的 ' + fmtNum(it.supLow) + '~' + fmtNum(it.supHigh)
          + '，按年化 ' + it.supDriftPct + '% 上移 → 当前 ' + fmtNum(supLow) + '~' + fmtNum(supHigh)
        : '',
      supLeft,
      supAlign: alignOf(supLeft),
      skyText: it.sky ? fmtNum(it.sky) : '',
      skyLabel: it.sky ? it.skyLabel : '',
      skyLeft,
      skyAlign: it.sky ? alignOf(skyLeft) : 'la-center',
    }
  })
}

module.exports = { KEY_POINTS, KEY_POINTS_DATE, buildKeyPoints }
