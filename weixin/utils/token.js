function tokenValue(message, label) {
  const match = String(message || '').match(new RegExp(`${label}=(\\d+)\\s*token`, 'i'))
  return match ? Number(match[1]) : 0
}

function parseTokenUsageLog(entry) {
  if (!entry || entry.event !== 'recipe_token_usage' || !entry.message) return undefined
  const dish = entry.message.match(/菜名=([^；;]+)/)
  if (!dish) return undefined
  const inputTokens = tokenValue(entry.message, '输入')
  const outputTokens = tokenValue(entry.message, '输出')
  const reasoningAvailable = /思考=\d+\s*token/i.test(entry.message)
  const reasoningTokens = tokenValue(entry.message, '思考')
  const answerTokens = reasoningAvailable ? tokenValue(entry.message, '回答') || Math.max(0, outputTokens - reasoningTokens) : outputTokens
  return {
    dishName: dish[1].trim() || '未识别菜名', inputTokens, outputTokens, reasoningTokens, answerTokens,
    totalTokens: tokenValue(entry.message, '总计') || inputTokens + outputTokens,
    reasoningAvailable,
  }
}

function periodStart(period, now, sessionStartedAt) {
  if (period === 'session') return new Date(sessionStartedAt).getTime()
  if (period === 'week') return now.getTime() - 7 * 86400000
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return -Infinity
}

function buildTokenAnalytics(logs, period, sessionStartedAt) {
  const now = new Date()
  const start = periodStart(period, now, sessionStartedAt || now)
  const result = { requestCount: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, answerTokens: 0, totalTokens: 0, unavailableCount: 0, dishes: [], days: [] }
  const dishes = {}
  const days = {}
  ;(logs || []).forEach((entry) => {
    const time = Date.parse(entry.timestamp)
    if (!Number.isFinite(time) || time < start || time > now.getTime()) return
    const usage = parseTokenUsageLog(entry)
    if (!usage) return
    result.requestCount += 1
    ;['inputTokens', 'outputTokens', 'reasoningTokens', 'answerTokens', 'totalTokens'].forEach((key) => { result[key] += usage[key] })
    if (!usage.totalTokens) result.unavailableCount += 1
    const dish = dishes[usage.dishName] || { name: usage.dishName, requestCount: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, answerTokens: 0, totalTokens: 0 }
    dish.requestCount += 1
    ;['inputTokens', 'outputTokens', 'reasoningTokens', 'answerTokens', 'totalTokens'].forEach((key) => { dish[key] += usage[key] })
    dishes[usage.dishName] = dish
    const date = new Date(time).toISOString().slice(0, 10)
    const day = days[date] || { date, totalTokens: 0, requestCount: 0 }
    day.totalTokens += usage.totalTokens
    day.requestCount += 1
    days[date] = day
  })
  result.dishes = Object.values(dishes).sort((a, b) => b.totalTokens - a.totalTokens)
  result.days = Object.values(days).sort((a, b) => a.date.localeCompare(b.date))
  return result
}

module.exports = { parseTokenUsageLog, buildTokenAnalytics }
