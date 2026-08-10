const { randomId } = require('./id')

const SECRET_PATTERN = /api[-_]?key|authorization|secret|image|base64|blob|content/i

function sanitize(value) {
  if (value === undefined || value === null) return undefined
  const text = value && value.message ? value.message : String(value)
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[IMAGE_REDACTED]')
    .slice(0, 260)
}

function write(level, moduleName, event, context) {
  try {
    const { logStore, settingsStore } = require('./storage')
    const settings = settingsStore.get()
    const details = context || {}
    if (!settings.debugMode && !details.persist && level !== 'warn' && level !== 'error') return
    const safe = {}
    Object.keys(details).forEach((key) => {
      if (!SECRET_PATTERN.test(key)) safe[key] = details[key]
    })
    logStore.add({
      id: randomId('log'),
      timestamp: new Date().toISOString(),
      level,
      module: moduleName,
      event,
      operationId: details.operationId || randomId('op'),
      stage: typeof safe.stage === 'string' ? safe.stage : undefined,
      result: typeof safe.result === 'string' ? safe.result : undefined,
      durationMs: Number.isFinite(safe.durationMs) ? Math.round(safe.durationMs) : undefined,
      errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : undefined,
      message: sanitize(safe.message),
    })
  } catch (_) {
    // Diagnostics must never block normal user actions.
  }
}

const logger = {
  debug: (moduleName, event, context) => write('debug', moduleName, event, context),
  info: (moduleName, event, context) => write('info', moduleName, event, context),
  warn: (moduleName, event, context) => write('warn', moduleName, event, context),
  error: (moduleName, event, context) => write('error', moduleName, event, context),
}

module.exports = { logger, sanitize }
