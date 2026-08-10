const { logger } = require('./utils/logger')
const { initializeStorage } = require('./utils/storage')

App({
  globalData: {
    sessionStartedAt: new Date().toISOString(),
  },

  onLaunch() {
    try {
      initializeStorage()
      logger.info('app', 'startup_ready', { stage: 'launch', result: 'success' })
    } catch (error) {
      logger.error('app', 'startup_failed', { stage: 'launch', message: error })
    }
  },

  onError(message) {
    logger.error('app', 'global_runtime_error', { stage: 'runtime', message })
  },

  onUnhandledRejection(event) {
    logger.error('app', 'unhandled_rejection', { stage: 'promise', message: event && event.reason })
  },
})
