function randomId(prefix) {
  const head = prefix ? `${prefix}-` : ''
  return `${head}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

module.exports = { randomId }
