const { showAppError, AppError } = require('../../utils/errors')
const { logger } = require('../../utils/logger')

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
function point(touch) {
  return {
    x: Number(touch.x !== undefined ? touch.x : touch.clientX) || 0,
    y: Number(touch.y !== undefined ? touch.y : touch.clientY) || 0,
  }
}
function distance(touches) {
  if (!touches || touches.length < 2) return 0
  const first = point(touches[0])
  const second = point(touches[1])
  const dx = first.x - second.x
  const dy = first.y - second.y
  return Math.sqrt(dx * dx + dy * dy)
}

Page({
  data: { zoomPercent: 100, rotation: 0, ready: false, saving: false },

  onLoad() {
    this.offsetX = 0
    this.offsetY = 0
    this.zoom = 1
    this.rotation = 0
    this.getOpenerEventChannel().on('imageSource', ({ path }) => {
      this.sourcePath = path
      this.tryLoadImage()
    })
  },

  onReady() {
    wx.createSelectorQuery().in(this).select('#cropCanvas').fields({ node: true, size: true }).exec((result) => {
      const info = result && result[0]
      if (!info || !info.node) return showAppError(new AppError('IMAGE', '图片编辑画布初始化失败'))
      this.canvas = info.node
      this.canvasWidth = info.width
      this.canvasHeight = info.height
      const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
      this.dpr = dpr
      this.canvas.width = Math.round(info.width * dpr)
      this.canvas.height = Math.round(info.height * dpr)
      this.context = this.canvas.getContext('2d')
      this.context.scale(dpr, dpr)
      this.tryLoadImage()
    })
  },

  tryLoadImage() {
    if (!this.canvas || !this.sourcePath || this.image) return
    const image = this.canvas.createImage()
    image.onload = () => {
      this.image = image
      this.imageWidth = image.width
      this.imageHeight = image.height
      this.setData({ ready: true })
      this.draw()
    }
    image.onerror = (error) => showAppError(new AppError('IMAGE', '该图片暂时无法进入编辑器，请先转换为 JPG/PNG', error))
    image.src = this.sourcePath
  },

  draw() {
    if (!this.context || !this.image) return
    const ctx = this.context
    const width = this.canvasWidth
    const height = this.canvasHeight
    const quarterTurn = this.rotation % 180 !== 0
    const rotatedWidth = quarterTurn ? this.imageHeight : this.imageWidth
    const rotatedHeight = quarterTurn ? this.imageWidth : this.imageHeight
    const cover = Math.max(width / rotatedWidth, height / rotatedHeight)
    const scale = cover * this.zoom
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#f3eee5'
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2 + this.offsetX, height / 2 + this.offsetY)
    ctx.rotate(this.rotation * Math.PI / 180)
    ctx.scale(scale, scale)
    ctx.drawImage(this.image, -this.imageWidth / 2, -this.imageHeight / 2)
    ctx.restore()
  },

  zoomChange(event) {
    this.zoom = clamp(Number(event.detail.value) / 100, 0.5, 3)
    this.setData({ zoomPercent: Math.round(this.zoom * 100) })
    this.draw()
  },

  rotate(event) {
    this.rotation = (this.rotation + Number(event.currentTarget.dataset.degrees) + 360) % 360
    this.offsetX = 0
    this.offsetY = 0
    this.setData({ rotation: this.rotation })
    this.draw()
  },

  touchStart(event) {
    const touches = event.touches || []
    this.startTouches = touches.map(point)
    this.startOffset = { x: this.offsetX, y: this.offsetY }
    this.startZoom = this.zoom
    this.startDistance = distance(touches)
  },

  touchMove(event) {
    const touches = event.touches || []
    if (!touches.length || !this.startTouches) return
    if (touches.length >= 2 && this.startDistance) {
      this.zoom = clamp(this.startZoom * distance(touches) / this.startDistance, 0.5, 3)
      this.setData({ zoomPercent: Math.round(this.zoom * 100) })
    } else {
      const current = point(touches[0])
      this.offsetX = this.startOffset.x + current.x - this.startTouches[0].x
      this.offsetY = this.startOffset.y + current.y - this.startTouches[0].y
    }
    this.draw()
  },

  reset() {
    this.zoom = 1; this.rotation = 0; this.offsetX = 0; this.offsetY = 0
    this.setData({ zoomPercent: 100, rotation: 0 })
    this.draw()
  },

  confirm() {
    if (!this.canvas || !this.image || this.data.saving) return
    this.setData({ saving: true })
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      fileType: 'jpg',
      quality: 0.9,
      destWidth: 1200,
      destHeight: 1200,
      success: (result) => {
        logger.info('image', 'edit_completed', { result: 'success', message: `rotation=${this.rotation};zoom=${this.zoom.toFixed(2)}` })
        this.getOpenerEventChannel().emit('imageEdited', { path: result.tempFilePath })
        wx.navigateBack()
      },
      fail: (error) => showAppError(new AppError('IMAGE', '保存编辑后的图片失败', error)),
      complete: () => this.setData({ saving: false }),
    }, this)
  },

  cancel() { wx.navigateBack() },
})
