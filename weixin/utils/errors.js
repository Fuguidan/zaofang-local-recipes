const ERROR_MESSAGES = {
  VALIDATION: '输入内容需要检查。',
  STORAGE: '本机存储操作失败。',
  IMAGE: '图片处理失败。',
  RECOMMENDATION: '推荐规则执行失败。',
  BACKUP: '备份文件处理失败。',
  NETWORK: '远程服务暂时不可用。',
  UNKNOWN: '发生了未预期的错误。',
}

class AppError extends Error {
  constructor(type, message, detail) {
    super(message || ERROR_MESSAGES[type] || ERROR_MESSAGES.UNKNOWN)
    this.name = 'AppError'
    this.type = type || 'UNKNOWN'
    this.detail = detail
    this.code = `${this.type}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  }
}

function toAppError(error, fallback) {
  if (error instanceof AppError) return error
  const message = error && error.message ? error.message : String(error || ERROR_MESSAGES.UNKNOWN)
  return new AppError(fallback || 'UNKNOWN', message, error)
}

function showAppError(error, fallback) {
  const appError = toAppError(error, fallback)
  wx.showModal({
    title: ERROR_MESSAGES[appError.type] || '操作失败',
    content: `${appError.message}\n错误编号：${appError.code}`,
    showCancel: false,
    confirmText: '知道了',
  })
  return appError
}

module.exports = { AppError, toAppError, showAppError, ERROR_MESSAGES }
