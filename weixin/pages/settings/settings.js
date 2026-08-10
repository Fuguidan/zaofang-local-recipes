const { settingsStore } = require('../../utils/storage')
const { NUTRIENTS } = require('../../utils/constants')
const { normalizeConfig, supportsThinking, testTextConnection, testVisionConnection } = require('../../utils/ai')
const { showAppError } = require('../../utils/errors')
const { logger } = require('../../utils/logger')

Page({
  data: {
    draft: settingsStore.get(),
    nutrientOptions: [],
    thinkingSupported: false,
    testing: '',
    testNotice: '',
  },

  onShow() {
    const draft = settingsStore.get()
    this.setData({
      draft,
      thinkingSupported: supportsThinking(draft.ai.endpoint),
      nutrientOptions: NUTRIENTS.map((item) => ({ ...item, checked: draft.nutrition.visibleNutrients.includes(item.key) })),
    })
  },

  inputAI(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    this.setData({ [`draft.ai.${field}`]: value })
    if (field === 'endpoint') this.setData({ thinkingSupported: supportsThinking(value) })
  },
  aiEnabledChange(event) { this.setData({ 'draft.ai.enabled': event.detail.value }) },
  thinkingChange(event) { this.setData({ 'draft.ai.thinkingEnabled': event.detail.value }) },
  debugChange(event) { this.setData({ 'draft.debugMode': event.detail.value }) },
  peopleInput(event) { this.setData({ 'draft.nutrition.estimatePeople': Math.max(1, Math.min(20, Number(event.detail.value) || 2)) }) },
  nutrientsChange(event) {
    const selected = event.detail.value
    this.setData({
      'draft.nutrition.visibleNutrients': selected,
      nutrientOptions: NUTRIENTS.map((item) => ({ ...item, checked: selected.includes(item.key) })),
    })
  },

  saveSettings() {
    const draft = { ...this.data.draft, ai: normalizeConfig(this.data.draft.ai) }
    settingsStore.put(draft)
    this.setData({ draft, thinkingSupported: supportsThinking(draft.ai.endpoint) })
    logger.info('settings', 'settings_saved', { result: 'success', message: `aiEnabled=${draft.ai.enabled};debug=${draft.debugMode}` })
    wx.showToast({ title: '设置已保存' })
  },

  async runTest(event) {
    const kind = event.currentTarget.dataset.kind
    if (this.data.testing) return
    try {
      const config = normalizeConfig(this.data.draft.ai)
      this.setData({ testing: kind, testNotice: kind === 'vision' ? '正在测试图片能力…' : '正在测试文本连接…' })
      const message = kind === 'vision' ? await testVisionConnection(config) : await testTextConnection(config)
      this.setData({ testNotice: `${message}。文本成功不代表图片模型一定可用。` })
      logger.info('ai', kind === 'vision' ? 'vision_test_success' : 'text_test_success', { result: 'success', message: `model=${config.model}` })
    } catch (error) {
      const appError = showAppError(error, 'NETWORK')
      this.setData({ testNotice: `测试失败：${error.suggestion || appError.message}` })
      logger.warn('ai', kind === 'vision' ? 'vision_test_failed' : 'text_test_failed', { result: 'failure', errorCode: appError.code, message: error.failure || appError.message })
    } finally { this.setData({ testing: '' }) }
  },

  openLogs() { wx.navigateTo({ url: '/pages/logs/logs' }) },
})
