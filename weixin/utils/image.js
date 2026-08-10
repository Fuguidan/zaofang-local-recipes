const { AppError } = require('./errors')

function extensionOf(path) {
  const clean = String(path || '').split('?')[0]
  const match = clean.match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : ''
}

function mimeForPath(path) {
  const ext = extensionOf(path)
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  if (ext === 'heif') return 'image/heif'
  return 'image/jpeg'
}

function isAiSupportedPath(path) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extensionOf(path))
}

function chooseRecipeImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
      success: (result) => resolve(result.tempFiles[0]),
      fail: (error) => {
        if (String(error.errMsg || '').includes('cancel')) resolve(undefined)
        else reject(new AppError('IMAGE', '选择图片失败', error))
      },
    })
  })
}

function compressImage(src) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src,
      quality: 88,
      compressedWidth: 2200,
      compressedHeight: 2200,
      success: (result) => resolve(result.tempFilePath),
      fail: reject,
    })
  })
}

function imageWorkDirectory() {
  const directory = `${wx.env.USER_DATA_PATH}/image-work`
  try { wx.getFileSystemManager().mkdirSync(directory, true) } catch (_) { /* Existing directory is expected. */ }
  return directory
}

function materializeJpeg(sourcePath) {
  const directory = imageWorkDirectory()
  const target = `${directory}/normalized-${Date.now()}.jpg`
  return copyFile(sourcePath, target).then(() => target)
}

async function normalizePickedImage(path) {
  const ext = extensionOf(path)
  if (['heic', 'heif'].includes(ext)) {
    try {
      const converted = await compressImage(path)
      const jpegPath = await materializeJpeg(converted)
      return { path: jpegPath, imageName: `菜品-${Date.now()}.jpg`, aiReady: true, notice: 'HEIC 已在本机转换为 JPEG。' }
    } catch (error) {
      return { path, imageName: `菜品-${Date.now()}.${ext}`, aiReady: false, notice: '已保留原始 HEIC；请进入图片编辑并保存为 JPEG 后再用于图片 AI。', error }
    }
  }
  try {
    const compressed = await compressImage(path)
    const jpegPath = await materializeJpeg(compressed)
    return { path: jpegPath, imageName: `菜品-${Date.now()}.jpg`, aiReady: true, notice: '图片已在本机优化为 JPEG。' }
  } catch (_) {
    return { path, imageName: `菜品-${Date.now()}.${ext || 'jpg'}`, aiReady: isAiSupportedPath(path), notice: '已保留原始图片。' }
  }
}

function ensureRecipeImageDirectory() {
  const directory = `${wx.env.USER_DATA_PATH}/recipe-images`
  try { wx.getFileSystemManager().mkdirSync(directory, true) } catch (_) { /* Existing directory is expected. */ }
  return directory
}

function copyFile(srcPath, destPath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().copyFile({ srcPath, destPath, success: resolve, fail: reject })
  })
}

function unlink(path) {
  return new Promise((resolve) => {
    if (!path || !String(path).startsWith(wx.env.USER_DATA_PATH)) return resolve()
    wx.getFileSystemManager().unlink({ filePath: path, success: resolve, fail: resolve })
  })
}

async function persistRecipeImage(path, recipeId, previousPath) {
  if (!path) {
    await unlink(previousPath)
    return ''
  }
  if (path === previousPath && String(path).startsWith(wx.env.USER_DATA_PATH)) return path
  const directory = ensureRecipeImageDirectory()
  const ext = isAiSupportedPath(path) ? extensionOf(path) || 'jpg' : extensionOf(path) || 'bin'
  const target = `${directory}/${recipeId}-${Date.now()}.${ext}`
  try {
    await copyFile(path, target)
    if (previousPath && previousPath !== target) await unlink(previousPath)
    if (String(path).startsWith(`${wx.env.USER_DATA_PATH}/image-work/`)) await unlink(path)
    return target
  } catch (error) {
    throw new AppError('IMAGE', '图片保存到本机失败，原菜谱未改变', error)
  }
}

function readImageDataUrl(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: (result) => resolve(`data:${mimeForPath(path)};base64,${result.data}`),
      fail: (error) => reject(new AppError('IMAGE', '读取图片失败', error)),
    })
  })
}

module.exports = {
  extensionOf,
  mimeForPath,
  isAiSupportedPath,
  chooseRecipeImage,
  normalizePickedImage,
  persistRecipeImage,
  deleteRecipeImage: unlink,
  readImageDataUrl,
}
