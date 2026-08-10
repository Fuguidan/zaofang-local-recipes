const { recipeStore, historyStore, clearBusinessData } = require('../../utils/storage')
const { createBackup, inspectBackup, commitBackup, discardPreview } = require('../../utils/backup')
const { deleteRecipeImage } = require('../../utils/image')
const { showAppError } = require('../../utils/errors')

function defaultFilename() { return `灶房菜谱备份-${new Date().toISOString().slice(0, 10)}.zip` }

Page({
  data: {
    recipeCount: 0,
    imageCount: 0,
    historyCount: 0,
    filename: defaultFilename(),
    exporting: false,
    progress: '',
    exportResult: null,
    importing: false,
    preview: null,
    conflictOptions: ['使用备份版本', '保留本机版本', '另存为副本'],
    conflictValues: ['overwrite', 'keep', 'copy'],
    conflictIndex: 0,
  },

  onShow() { this.refreshSummary() },

  refreshSummary() {
    const recipes = recipeStore.all()
    this.setData({ recipeCount: recipes.length, imageCount: recipes.filter((item) => item.imagePath).length, historyCount: historyStore.all().length })
  },
  filenameInput(event) { this.setData({ filename: event.detail.value }) },

  async exportBackup() {
    if (this.data.exporting) return
    try {
      this.setData({ exporting: true, progress: '正在整理菜谱和图片…', exportResult: null })
      const result = await createBackup(this.data.filename, (progress) => {
        this.setData({ progress: `正在写入 ${progress.completed}/${progress.total} · ${(progress.bytes / 1024 / 1024).toFixed(1)} MB` })
      })
      this.setData({ exportResult: result, progress: 'ZIP 已在本机生成，请点击分享或保存。' })
      wx.showToast({ title: '导出完成' })
    } catch (error) { showAppError(error, 'BACKUP') } finally { this.setData({ exporting: false }) }
  },

  shareBackup() {
    const result = this.data.exportResult
    if (!result) return
    if (!wx.shareFileMessage) return wx.showModal({ title: '当前微信版本不支持', content: `文件已生成在小程序本地：${result.path}`, showCancel: false })
    wx.shareFileMessage({
      filePath: result.path,
      fileName: result.filename,
      fail: (error) => { if (!String(error.errMsg || '').includes('cancel')) showAppError(error, 'BACKUP') },
    })
  },

  chooseImport() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['zip'],
      success: async (result) => {
        try {
          if (this.data.preview) await discardPreview(this.data.preview)
          this.setData({ importing: true, progress: '正在校验 ZIP 结构和图片…', preview: null })
          const preview = await inspectBackup(result.tempFiles[0].path)
          this.setData({ preview, progress: '' })
        } catch (error) { showAppError(error, 'BACKUP') } finally { this.setData({ importing: false }) }
      },
    })
  },

  conflictChange(event) { this.setData({ conflictIndex: Number(event.detail.value) }) },

  async confirmImport() {
    if (!this.data.preview || this.data.importing) return
    try {
      this.setData({ importing: true, progress: '正在事务式写入本机，失败会自动回滚…' })
      await commitBackup(this.data.preview, this.data.conflictValues[this.data.conflictIndex])
      this.setData({ preview: null, progress: '' })
      this.refreshSummary()
      wx.showToast({ title: '导入完成' })
    } catch (error) { showAppError(error, 'BACKUP') } finally { this.setData({ importing: false }) }
  },

  async cancelImport() {
    await discardPreview(this.data.preview)
    this.setData({ preview: null, progress: '' })
  },

  clearData() {
    wx.showModal({
      title: '清空本机业务数据？',
      content: '菜谱、图片和推荐历史都会被删除。建议先导出 ZIP 备份。',
      confirmText: '确认清空',
      confirmColor: '#8b2e2e',
      success: async (result) => {
        if (!result.confirm) return
        const images = recipeStore.all().map((item) => item.imagePath).filter(Boolean)
        clearBusinessData()
        for (const path of images) await deleteRecipeImage(path)
        this.setData({ exportResult: null, filename: defaultFilename() })
        this.refreshSummary()
        wx.showToast({ title: '已清空' })
      },
    })
  },
})
