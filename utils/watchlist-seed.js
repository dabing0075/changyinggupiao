// 「我的关注」17只标的 · 固定锚点版（数据截至 2026-10-09 盘中）
// 来源：《说明.docx》固定锚点（支撑/压力）与规则化操作
// 前13只为权益类，后4只为债券/现金类；price/tech 为 2026-10-08 收盘复盘值，行情由云端自动刷新
const WATCHLIST_SNAPSHOT = [
  { name: '红利ETF', code: '515180', price: 1.433, change_pct: 1.1, tech: '逆市收红，KDJ金叉但J偏高', support: '1.42', resistance: '1.487', long_term: '持有', tip: '买：回踩1.42-1.43企稳加仓；卖：1.47-1.50分批止盈，破1.42减仓' },
  { name: '创业板ETF', code: '159915', price: 3.05, change_pct: -3.2, tech: '下行，KDJ超卖边缘', support: '2.95', resistance: '3.30', long_term: '等MA20走平上拐再说', tip: '买：收盘站稳MA10(≈3.25)再买；卖：3.30-3.50减磅，破2.95止损' },
  { name: 'A500ETF', code: '563800', price: 1.133, change_pct: -1.6, tech: '下行寻底，创阶段低位', support: '1.11', resistance: '1.21', long_term: '等右侧确认', tip: '买：1.11-1.12分批建仓；卖：1.21-1.24减磅' },
  { name: '信息技术ETF', code: '159939', price: 0.989, change_pct: -3.8, tech: '收于20日低点，MACD空头', support: '0.938', resistance: '1.07', long_term: '调整期不加大长线', tip: '买：站稳1.07右侧进场；卖：收盘破0.938清波段仓' },
  { name: '消费ETF', code: '510150', price: 0.488, change_pct: -2.0, tech: '震荡，MACD转多、KDJ死叉', support: '0.477', resistance: '0.504', long_term: '区间循环操作', tip: '买：0.478-0.48区间分批；卖：0.50-0.52高抛' },
  { name: '医药ETF', code: '159938', price: 0.641, change_pct: -2.4, tech: '震荡，贴MA60', support: '0.612', resistance: '0.66', long_term: '长线持有', tip: '买：0.61-0.64低吸；卖：0.66上方分批止盈' },
  { name: '中概互联网ETF', code: '513050', price: 0.981, change_pct: -2.5, tech: '当日刚死叉', support: '0.981', resistance: '1.02', long_term: '修复初期持有', tip: '买：回踩1.00加仓；卖：1.02-1.07分批，破0.98止损' },
  { name: '恒生科技ETF', code: '513180', price: 0.516, change_pct: -3.4, tech: '下行，收年内最低区', support: '0.514', resistance: '0.55', long_term: '未反转不加长线', tip: '买：站稳0.55右侧买；卖：0.58-0.62减磅' },
  { name: '黄金ETF', code: '518880', price: 8.47, change_pct: -1.8, tech: '高位回落，KDJ超卖（K≈13）', support: '8.46', resistance: '8.85', long_term: '长期对冲配置持有', tip: '买：8.46-8.56分批；卖：8.85上方分批' },
  { name: '北方华创', code: '002371', price: 600.32, change_pct: -2.5, tech: '下行，回撤约1/3', support: '564.5', resistance: '600', long_term: '等业绩拐点，暂不加长线', tip: '买：不抢反弹，站稳600再看；卖：600-645减仓，收盘破564.5清仓' },
  { name: '腾讯控股', code: '0700', price: 411.40, change_pct: -2.2, tech: '贴近年低点', support: '411.2', resistance: '450', long_term: '估值低位，长线持有', tip: '买：回踩415-420分档加仓；卖：450-463分批兑现' },
  { name: '中国平安', code: '601318', price: 52.67, change_pct: -1.2, tech: 'KDJ低位拐头', support: '52.2', resistance: '54', long_term: '深度价值，长线持有', tip: '买：52-52.5分档；卖：54.5-55减一档、58再减' },
  { name: '宁德时代', code: '300750', price: 286.75, change_pct: -1.5, tech: '严重超卖（K=D≈10）', support: '285', resistance: '300', long_term: '中报高增，长线持有', tip: '买：285-289抄底档；卖：300上方分批，站稳313转为持有' },
  { name: '国开债ETF', code: '159649', price: 110.533, change_pct: 0, tech: '高位慢牛（96%分位）', support: '', resistance: '', long_term: '持有', tip: '区间110.10-110.63；不折腾，收息' },
  { name: '信用债ETF', code: '511190', price: 103.185, change_pct: 0, tech: '触一年顶部，KDJ超买（99.7%分位）', support: '', resistance: '', long_term: '持有', tip: '区间102.21-103.24；不折腾，收息' },
  { name: '招商财富宝ETF', code: '511850', price: 100.0, change_pct: 0, tech: '贴面值', support: '', resistance: '', long_term: '现管底仓', tip: '活钱，随取随用' },
  { name: '货币ETF平安', code: '511700', price: 100.0, change_pct: 0, tech: '贴面值', support: '', resistance: '', long_term: '现管底仓', tip: '活钱，随取随用' },
]

module.exports = { WATCHLIST_SNAPSHOT }
