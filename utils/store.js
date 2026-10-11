const { cloud } = require('./cloud')
const { INDICES } = require('./strategy')

// 取当前会话；未登录返回 null（页面据此展示登录面板）
async function currentSession() {
  const app = getApp()
  if (app.globalData.session) return app.globalData.session
  return app.refreshSession()
}

// 微信一键登录（小程序）
function wechatLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      async success({ code }) {
        try {
          const appid = wx.getAccountInfoSync().miniProgram.appId
          const { data: session, error } = await cloud.auth.signInWithWechat(code, appid)
          if (error) {
            reject(new Error(error.message || '微信登录失败，请重试'))
            return
          }
          getApp().globalData.session = session
          resolve(session)
        } catch (e) {
          console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
            stage: 'wechat-login-handler',
            message: e instanceof Error ? e.message : '微信登录失败，请重试',
          }))
          reject(new Error('微信登录失败，请重试'))
        }
      },
      fail(err) {
        console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
          stage: 'wx.login',
          message: err.errMsg,
        }))
        reject(new Error(err.errMsg || '微信登录失败'))
      },
    })
  })
}

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

// ─── 账户管理 ─────────────────────────────────────────────

async function loadAccounts() {
  const rows = unwrap(await cloud.database.from('accounts').select('*').order('id', { ascending: true }))
  if (rows && rows.length) return rows
  const created = unwrap(
    await cloud.database.from('accounts').insert({ name: '默认账户', total_capital: 1000000, market_temp: 'fair' }).select()
  )
  return created
}

async function createAccount(name, totalCapital) {
  const rows = unwrap(
    await cloud.database.from('accounts').insert({ name, total_capital: totalCapital, market_temp: 'fair' }).select()
  )
  return rows[0]
}

async function saveAccount(id, patch) {
  const rows = unwrap(await cloud.database.from('accounts').update(patch).eq('id', id).select())
  if (!rows || rows.length === 0) throw new Error('账户保存失败，请重试')
  return rows[0]
}

async function deleteAccount(id) {
  // 级联清理该账户的持仓/交易/消息（调用方已确认）
  await cloud.database.from('holdings').delete().eq('account_id', id)
  await cloud.database.from('trades').delete().eq('account_id', id)
  await cloud.database.from('messages').delete().eq('account_id', id)
  unwrap(await cloud.database.from('accounts').delete().eq('id', id).select())
}

const ACTIVE_KEY = 'active_account_id'
// 特殊ID：选中「账户总计」时作为激活账户ID，读路径聚合所有账户数据
const ALL_ACCOUNTS_ID = '__all__'

// 由账户列表构造「账户总计」聚合账户（总额=各账户资金之和）
function aggregateAccount(accounts) {
  const total = (accounts || []).reduce((s, a) => s + Number(a.total_capital || 0), 0)
  return { id: ALL_ACCOUNTS_ID, name: '账户总计', total_capital: total, market_temp: 'fair', _all: true }
}

function getActiveAccountId() {
  try {
    return wx.getStorageSync(ACTIVE_KEY) || null
  } catch (e) {
    return null
  }
}

function setActiveAccountId(id) {
  try {
    wx.setStorageSync(ACTIVE_KEY, id)
  } catch (e) { /* 忽略存储失败 */ }
}

// 取当前激活账户（没有则默认第一个并记住；选中账户总计时返回聚合账户）
async function activeAccount() {
  const accounts = await loadAccounts()
  const saved = getActiveAccountId()
  if (String(saved) === ALL_ACCOUNTS_ID) {
    return { account: aggregateAccount(accounts), accounts }
  }
  const found = accounts.find((a) => String(a.id) === String(saved))
  const active = found || accounts[0]
  if (!found) setActiveAccountId(active.id)
  return { account: active, accounts }
}

// 兼容旧调用：设置即当前账户
async function loadSettings() {
  const { account } = await activeAccount()
  return account
}

async function saveSettings(id, patch) {
  return saveAccount(id, patch)
}

// ─── 权益占比选择（按账户本地持久化；null=跟随市场温度自动） ───

const EQUITY_RATIO_PREFIX = 'equity_ratio:'

function getEquityRatio(accountId) {
  try {
    const n = Number(wx.getStorageSync(EQUITY_RATIO_PREFIX + accountId))
    return n > 0 && n <= 1 ? n : null
  } catch (e) {
    return null
  }
}

function setEquityRatio(accountId, ratio) {
  try {
    if (ratio === null || ratio === undefined) {
      wx.removeStorageSync(EQUITY_RATIO_PREFIX + accountId)
    } else {
      wx.setStorageSync(EQUITY_RATIO_PREFIX + accountId, ratio)
    }
  } catch (e) { /* 忽略存储失败 */ }
}

// ─── 持仓（按账户） ────────────────────────────────────────

async function loadHoldings(accountId) {
  // 账户总计：聚合所有账户的持仓，按标的合并（金额相加，估值/价格取同标的值）
  if (String(accountId) === ALL_ACCOUNTS_ID) {
    const rows = unwrap(await cloud.database.from('holdings').select('*')) || []
    const map = {}
    rows.forEach((r) => {
      if (map[r.symbol]) {
        map[r.symbol].current_amount = Number(map[r.symbol].current_amount || 0) + Number(r.current_amount || 0)
      } else {
        map[r.symbol] = { ...r, account_id: ALL_ACCOUNTS_ID }
      }
    })
    return INDICES.map((i) => map[i.symbol] || {
      account_id: ALL_ACCOUNTS_ID,
      symbol: i.symbol, code: i.code, name: i.name,
      asset_type: i.type, target_weight: i.targetWeight, current_amount: 0,
    })
  }
  const rows = unwrap(await cloud.database.from('holdings').select('*').eq('account_id', accountId))
  if (rows && rows.length) {
    // 新加入 INDICES 的标的对老账户补齐（如中概互联网/恒生科技）
    const have = new Set(rows.map((r) => r.symbol))
    const missing = INDICES.filter((i) => !have.has(i.symbol)).map((i) => ({
      account_id: accountId,
      symbol: i.symbol, code: i.code, name: i.name,
      asset_type: i.type, target_weight: i.targetWeight, current_amount: 0,
    }))
    if (missing.length) {
      const added = unwrap(await cloud.database.from('holdings').insert(missing).select())
      return rows.concat(added || [])
    }
    return rows
  }
  const seed = INDICES.map((i) => ({
    account_id: accountId,
    symbol: i.symbol, code: i.code, name: i.name,
    asset_type: i.type, target_weight: i.targetWeight, current_amount: 0,
  }))
  const created = unwrap(await cloud.database.from('holdings').insert(seed).select())
  return created
}

async function saveHolding(id, patch) {
  const rows = unwrap(
    await cloud.database.from('holdings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select()
  )
  if (!rows || rows.length === 0) throw new Error('持仓保存失败，请重试')
  return rows[0]
}

// ─── 交易日志（按账户） ────────────────────────────────────

async function loadTrades(accountId) {
  let q = cloud.database.from('trades').select('*')
  if (String(accountId) !== ALL_ACCOUNTS_ID) q = q.eq('account_id', accountId)
  return unwrap(await q.order('traded_at', { ascending: false }).limit(100))
}

async function addTrade(trade) {
  const rows = unwrap(await cloud.database.from('trades').insert(trade).select())
  return rows[0]
}

async function deleteTrade(id) {
  unwrap(await cloud.database.from('trades').delete().eq('id', id).select())
}

// ─── 消息中心（按账户） ────────────────────────────────────

// 消息提醒为全局统一视图，不按账户区分：
// 无论选中哪个账户，都返回同一批消息；同一内容（条件）全局只显示一条
// （优先 active 记录，其次最新）。account_id 仅用于生成时的条件判定与状态重置。
async function loadMessages(accountId) {
  const rows = unwrap(
    await cloud.database.from('messages').select('*').order('created_at', { ascending: false }).limit(100)
  ) || []
  const best = {}
  rows.forEach((r) => {
    const bk = msgBaseKey(r.msg_key)
    const cur = best[bk]
    if (!cur || (r.active === true && cur.active !== true)) best[bk] = r
  })
  return Object.values(best)
}

// 消息写入：带状态重置的去重（云端 upsert 的 ignoreDuplicates 不生效）
// 机制：msg_key 去掉日期前缀作为内容指纹——
//  1) 任一账户已有同内容的 active 提醒 → 所有账户都不再重复发送（跨账户全局去重）
//  2) 本账户条件已解除（本次未再生成该候选）→ 本账户旧记录置 active=false
//  3) 条件解除后再次触发：全局无 active 记录 → 作为新消息重新发送（历史保留）
function msgBaseKey(k) {
  return String(k || '').replace(/^\d{4}-\d{2}-\d{2}:/, '')
}

async function upsertMessages(rows, accountId) {
  const accId = accountId !== undefined ? accountId : (rows && rows[0] ? rows[0].account_id : null)
  if (accId === null || accId === undefined) return
  const list = rows || []
  // 读取本用户全部消息（RLS 限定 owner），用于跨账户全局去重 + 本账户状态重置
  const all = unwrap(
    await cloud.database.from('messages').select('id,msg_key,active,account_id')
  ) || []
  const existing = all.filter((r) => String(r.account_id) === String(accId))
  // 全局内容指纹集合：任一账户处于 active 状态的提醒
  const activeGlobal = new Set()
  all.forEach((r) => { if (r.active) activeGlobal.add(msgBaseKey(r.msg_key)) })
  const currentBases = new Set(list.map((r) => msgBaseKey(r.msg_key)))
  // 1) 本账户条件已解除的历史提醒 → 置为 inactive（重置，允许日后重新提醒）
  const toDeactivate = existing
    .filter((r) => r.active && !currentBases.has(msgBaseKey(r.msg_key)))
    .map((r) => r.id)
  // 2) 需发送的新消息：全局范围内没有同内容的 active 提醒
  const seen = new Set()
  const fresh = []
  list.forEach((r) => {
    const bk = msgBaseKey(r.msg_key)
    if (!r.msg_key || seen.has(bk)) return
    seen.add(bk)
    if (!activeGlobal.has(bk)) fresh.push(r)
  })
  const ops = []
  if (toDeactivate.length) {
    ops.push(cloud.database.from('messages').update({ active: false }).in('id', toDeactivate))
  }
  if (fresh.length) {
    ops.push(cloud.database.from('messages').insert(fresh))
  }
  if (!ops.length) return
  const results = await Promise.all(ops)
  results.forEach(({ error }) => { if (error) throw error })
}

async function markMessagesRead(ids) {
  if (!ids || ids.length === 0) return
  const { error } = await cloud.database.from('messages').update({ read: true }).in('id', ids)
  if (error) throw error
}

// 全部已读：全局清除所有未读（消息不分账户，与全局统一视图一致）
async function markAllRead(accountId) {
  const { error } = await cloud.database.from('messages').update({ read: true }).eq('read', false)
  if (error) throw error
}

// 按内容指纹标记已读：同一消息在多个账户下的副本一并清除，
// 与「账户总计」视图的去重显示配套（点一条 = 整组已读）
async function markReadByBaseKey(msgKey) {
  const bk = msgBaseKey(msgKey)
  const rows = unwrap(
    await cloud.database.from('messages').select('id,msg_key').eq('read', false)
  ) || []
  const ids = rows.filter((r) => msgBaseKey(r.msg_key) === bk).map((r) => r.id)
  await markMessagesRead(ids)
}

async function unreadCount(accountId) {
  // 全局未读数：按内容指纹去重（同一消息只算 1 条），不区分账户
  const rows = unwrap(
    await cloud.database.from('messages').select('msg_key').eq('read', false)
  ) || []
  const set = new Set(rows.map((r) => msgBaseKey(r.msg_key)))
  return set.size
}

// ─── 关注列表（用户级，不区分账户） ─────────────────────────

async function loadWatchlist() {
  return unwrap(await cloud.database.from('watchlist_items').select('*').order('id', { ascending: true }))
}

async function importWatchlist(items) {
  const created = unwrap(await cloud.database.from('watchlist_items').insert(items).select())
  return created
}

async function saveWatchItem(id, patch) {
  const rows = unwrap(
    await cloud.database.from('watchlist_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select()
  )
  if (!rows || rows.length === 0) throw new Error('保存失败，请重试')
  return rows[0]
}

module.exports = {
  currentSession, wechatLogin,
  loadAccounts, createAccount, saveAccount, deleteAccount,
  ALL_ACCOUNTS_ID, aggregateAccount,
  getActiveAccountId, setActiveAccountId, activeAccount,
  loadSettings, saveSettings, getEquityRatio, setEquityRatio,
  loadHoldings, saveHolding,
  loadTrades, addTrade, deleteTrade,
  loadWatchlist, importWatchlist, saveWatchItem,
  loadMessages, upsertMessages, markMessagesRead, markAllRead, markReadByBaseKey, msgBaseKey, unreadCount,
}
