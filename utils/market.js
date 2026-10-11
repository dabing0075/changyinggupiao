const { cloud } = require('./cloud')

// 行情快照（云端 market_data 表，由定时任务自动更新，公开可读）
async function loadMarket() {
  const { data, error } = await cloud.database.from('market_data').select('*')
  if (error) throw error
  const bySymbol = {}
  const byDigits = {}
  ;(data || []).forEach((r) => {
    bySymbol[r.symbol] = r
    if (r.code) byDigits[r.code.replace(/[a-zA-Z]/g, '')] = r
  })
  return { list: data || [], bySymbol, byDigits }
}

// 是否处于A股交易时段（用于决定是否自动轮询行情）
function isTradingHours(now) {
  const d = now || new Date()
  const day = d.getDay()
  if (day === 0 || day === 6) return false
  const mins = d.getHours() * 60 + d.getMinutes()
  return (mins >= 9 * 60 + 30 && mins <= 11 * 60 + 30) || (mins >= 13 * 60 && mins <= 15 * 60)
}

function fmtTime(iso) {
  if (!iso) return ''
  return String(iso).replace('T', ' ').slice(5, 16)
}

module.exports = { loadMarket, isTradingHours, fmtTime }
