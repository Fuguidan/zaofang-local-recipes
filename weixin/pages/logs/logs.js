const { logStore } = require('../../utils/storage')
const { buildTokenAnalytics } = require('../../utils/token')
const { createDiagnosticFile } = require('../../utils/backup')
const { showAppError } = require('../../utils/errors')

Page({
  data: {
    filter: 'all',
    period: 'month',
    logs: [],
    visibleLogs: [],
    analytics: {},
    dishes: [],
    days: [],
  },

  onShow() { this.refresh() },

  refresh() {
    const logs = logStore.all()
    this.setData({ logs })
    this.applyFilter(this.data.filter)
    this.applyPeriod(this.data.period)
  },

  setFilter(event) { this.applyFilter(event.currentTarget.dataset.value) },
  applyFilter(filter) {
    const visibleLogs = this.data.logs.filter((entry) => filter === 'all' || entry.level === filter)
    this.setData({ filter, visibleLogs })
  },

  setPeriod(event) { this.applyPeriod(event.currentTarget.dataset.value) },
  applyPeriod(period) {
    const app = getApp()
    const analytics = buildTokenAnalytics(this.data.logs, period, app.globalData.sessionStartedAt)
    const maxDish = Math.max(1, ...analytics.dishes.map((item) => item.totalTokens))
    const maxDay = Math.max(1, ...analytics.days.map((item) => item.totalTokens))
    this.setData({
      period,
      analytics,
      dishes: analytics.dishes.slice(0, 12).map((item) => ({ ...item, width: Math.max(4, Math.round(item.totalTokens / maxDish * 100)) })),
      days: analytics.days.slice(-14).map((item) => ({ ...item, label: item.date.slice(5), height: Math.max(4, Math.round(item.totalTokens / maxDay * 100)) })),
    })
  },

  copyLogs() {
    wx.setClipboardData({ data: JSON.stringify(this.data.visibleLogs, null, 2), success: () => wx.showToast({ title: '已复制' }) })
  },

  exportLogs() {
    try {
      const path = createDiagnosticFile()
      if (!wx.shareFileMessage) return wx.showModal({ title: '日志已生成', content: path, showCancel: false })
      wx.shareFileMessage({ filePath: path, fileName: path.split('/').pop(), fail: (error) => { if (!String(error.errMsg || '').includes('cancel')) showAppError(error, 'STORAGE') } })
    } catch (error) { showAppError(error, 'STORAGE') }
  },

  clearLogs() {
    wx.showModal({ title: '清空诊断日志？', content: 'Token 用量统计也会同时清空。', confirmText: '清空', success: (result) => { if (result.confirm) { logStore.clear(); this.refresh() } } })
  },
})
