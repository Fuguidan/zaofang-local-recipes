const { recipeStore, settingsStore, historyStore, logStore } = require('./storage')
const { extensionOf, deleteRecipeImage } = require('./image')
const { randomId } = require('./id')
const { AppError } = require('./errors')
const { logger } = require('./logger')

const fs = wx.getFileSystemManager()
const CHUNK_SIZE = 256 * 1024

function utf8Encode(text) {
  const binary = unescape(encodeURIComponent(String(text)))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function utf8Decode(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(offset + 32768, bytes.length)))
  }
  return decodeURIComponent(escape(binary))
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crcUpdate(crc, bytes) {
  let value = crc
  for (let i = 0; i < bytes.length; i += 1) value = CRC_TABLE[(value ^ bytes[i]) & 0xff] ^ (value >>> 8)
  return value >>> 0
}

function crc32(bytes) {
  return (crcUpdate(0xffffffff, bytes) ^ 0xffffffff) >>> 0
}

function put16(view, offset, value) { view.setUint16(offset, value, true) }
function put32(view, offset, value) { view.setUint32(offset, value >>> 0, true) }

function dosDateTime(date) {
  const value = date || new Date()
  const year = Math.max(1980, value.getFullYear())
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  }
}

function localHeader(nameBytes, crc, size, stamp) {
  const bytes = new Uint8Array(30 + nameBytes.length)
  const view = new DataView(bytes.buffer)
  put32(view, 0, 0x04034b50); put16(view, 4, 20); put16(view, 6, 0x0800); put16(view, 8, 0)
  put16(view, 10, stamp.time); put16(view, 12, stamp.date); put32(view, 14, crc); put32(view, 18, size); put32(view, 22, size)
  put16(view, 26, nameBytes.length); put16(view, 28, 0); bytes.set(nameBytes, 30)
  return bytes
}

function centralHeader(nameBytes, crc, size, offset, stamp) {
  const bytes = new Uint8Array(46 + nameBytes.length)
  const view = new DataView(bytes.buffer)
  put32(view, 0, 0x02014b50); put16(view, 4, 20); put16(view, 6, 20); put16(view, 8, 0x0800); put16(view, 10, 0)
  put16(view, 12, stamp.time); put16(view, 14, stamp.date); put32(view, 16, crc); put32(view, 20, size); put32(view, 24, size)
  put16(view, 28, nameBytes.length); put16(view, 30, 0); put16(view, 32, 0); put16(view, 34, 0); put16(view, 36, 0)
  put32(view, 38, 0); put32(view, 42, offset); bytes.set(nameBytes, 46)
  return bytes
}

function endRecord(count, centralSize, centralOffset) {
  const bytes = new Uint8Array(22)
  const view = new DataView(bytes.buffer)
  put32(view, 0, 0x06054b50); put16(view, 4, 0); put16(view, 6, 0); put16(view, 8, count); put16(view, 10, count)
  put32(view, 12, centralSize); put32(view, 16, centralOffset); put16(view, 20, 0)
  return bytes
}

function arrayBufferOf(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function ensureDirectory(path) {
  try { fs.mkdirSync(path, true) } catch (_) { /* Existing directory is expected. */ }
}

function writeBytes(fd, bytes, position) {
  fs.writeSync({ fd, data: arrayBufferOf(bytes), offset: 0, length: bytes.byteLength, position })
  return position + bytes.byteLength
}

function readCount(result) {
  return typeof result === 'number' ? result : Number(result && result.bytesRead) || 0
}

function yieldToUi() { return new Promise((resolve) => setTimeout(resolve, 0)) }

async function scanFile(path) {
  const size = Number(fs.statSync(path).size)
  const fd = fs.openSync({ filePath: path, flag: 'r' })
  let crc = 0xffffffff
  let position = 0
  try {
    while (position < size) {
      const length = Math.min(CHUNK_SIZE, size - position)
      const buffer = new ArrayBuffer(length)
      const count = readCount(fs.readSync({ fd, arrayBuffer: buffer, offset: 0, length, position }))
      if (!count) throw new Error('read_backup_source_failed')
      crc = crcUpdate(crc, new Uint8Array(buffer, 0, count))
      position += count
      if (position % (CHUNK_SIZE * 8) === 0) await yieldToUi()
    }
  } finally { fs.closeSync({ fd }) }
  return { size, crc: (crc ^ 0xffffffff) >>> 0 }
}

async function copyFileIntoZip(sourcePath, outputFd, outputPosition) {
  const size = Number(fs.statSync(sourcePath).size)
  const inputFd = fs.openSync({ filePath: sourcePath, flag: 'r' })
  let inputPosition = 0
  let nextOutput = outputPosition
  try {
    while (inputPosition < size) {
      const length = Math.min(CHUNK_SIZE, size - inputPosition)
      const buffer = new ArrayBuffer(length)
      const count = readCount(fs.readSync({ fd: inputFd, arrayBuffer: buffer, offset: 0, length, position: inputPosition }))
      if (!count) throw new Error('read_backup_source_failed')
      const bytes = new Uint8Array(buffer, 0, count)
      nextOutput = writeBytes(outputFd, bytes, nextOutput)
      inputPosition += count
      if (inputPosition % (CHUNK_SIZE * 8) === 0) await yieldToUi()
    }
  } finally { fs.closeSync({ fd: inputFd }) }
  return nextOutput
}

async function createZip(entries, outputPath, onProgress) {
  const outputFd = fs.openSync({ filePath: outputPath, flag: 'w+' })
  const central = []
  let position = 0
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const nameBytes = utf8Encode(entry.name)
      const stamp = dosDateTime(new Date())
      const metadata = entry.bytes ? { size: entry.bytes.byteLength, crc: crc32(entry.bytes) } : await scanFile(entry.filePath)
      if (metadata.size > 0xffffffff || position > 0xffffffff) throw new AppError('BACKUP', '单个备份文件超过 ZIP 兼容上限')
      const offset = position
      position = writeBytes(outputFd, localHeader(nameBytes, metadata.crc, metadata.size, stamp), position)
      position = entry.bytes ? writeBytes(outputFd, entry.bytes, position) : await copyFileIntoZip(entry.filePath, outputFd, position)
      central.push(centralHeader(nameBytes, metadata.crc, metadata.size, offset, stamp))
      if (onProgress) onProgress({ completed: index + 1, total: entries.length, bytes: position })
      await yieldToUi()
    }
    const centralOffset = position
    central.forEach((bytes) => { position = writeBytes(outputFd, bytes, position) })
    const centralSize = position - centralOffset
    position = writeBytes(outputFd, endRecord(entries.length, centralSize, centralOffset), position)
    return { path: outputPath, size: position }
  } finally { fs.closeSync({ fd: outputFd }) }
}

function safeFilename(name) {
  const value = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '-') || `灶房菜谱备份-${new Date().toISOString().slice(0, 10)}`
  return value.toLowerCase().endsWith('.zip') ? value : `${value}.zip`
}

async function createBackup(filename, onProgress) {
  const operationId = randomId('backup')
  const started = Date.now()
  const recipes = recipeStore.all()
  const settings = settingsStore.get()
  const history = historyStore.all()
  const imageFiles = []
  const payloadRecipes = recipes.map((recipe) => {
    const copy = { ...recipe }
    delete copy.imagePath
    if (recipe.imagePath) {
      const archivePath = `images/${recipe.id}.${extensionOf(recipe.imagePath) || 'jpg'}`
      copy.imagePath = archivePath
      imageFiles.push(archivePath)
    }
    return copy
  })
  const manifest = { format: 'zaofan-backup', version: 1, appVersion: '1.0.0-weixin', createdAt: new Date().toISOString(), recipeCount: recipes.length, imageFiles }
  const payload = { recipes: payloadRecipes, settings: { debugMode: settings.debugMode, nutrition: settings.nutrition }, history }
  const entries = [
    { name: 'manifest.json', bytes: utf8Encode(JSON.stringify(manifest, null, 2)) },
    { name: 'data.json', bytes: utf8Encode(JSON.stringify(payload, null, 2)) },
  ]
  recipes.forEach((recipe) => {
    if (!recipe.imagePath) return
    const archivePath = payloadRecipes.find((item) => item.id === recipe.id).imagePath
    entries.push({ name: archivePath, filePath: recipe.imagePath })
  })
  const directory = `${wx.env.USER_DATA_PATH}/backups`
  ensureDirectory(directory)
  const output = `${directory}/${safeFilename(filename)}`
  try {
    const result = await createZip(entries, output, onProgress)
    logger.info('backup', 'export_success', { operationId, result: 'success', stage: 'zip_stream', durationMs: Date.now() - started, message: `records=${recipes.length};bytes=${result.size}` })
    return { ...result, filename: safeFilename(filename), recipeCount: recipes.length, imageCount: imageFiles.length }
  } catch (error) {
    try { fs.unlinkSync(output) } catch (_) { /* Partial file cleanup is best effort. */ }
    logger.error('backup', 'export_failed', { operationId, result: 'failure', stage: 'zip_stream', durationMs: Date.now() - started, message: error })
    throw new AppError('BACKUP', error.message || 'ZIP 导出失败', error)
  }
}

function unzip(zipFilePath, targetPath) {
  return new Promise((resolve, reject) => {
    fs.unzip({ zipFilePath, targetPath, success: resolve, fail: (error) => reject(new AppError('BACKUP', 'ZIP 文件无法解压或格式已损坏', error)) })
  })
}

function readJson(path) {
  try {
    const result = fs.readFileSync(path, 'utf8')
    return JSON.parse(typeof result === 'string' ? result : utf8Decode(new Uint8Array(result)))
  } catch (error) {
    throw new AppError('BACKUP', '备份 JSON 无效', error)
  }
}

function removeDirectory(path) {
  return new Promise((resolve) => fs.rmdir({ dirPath: path, recursive: true, success: resolve, fail: resolve }))
}

async function inspectBackup(zipFilePath) {
  const operationId = randomId('backup')
  const targetPath = `${wx.env.USER_DATA_PATH}/backup-import-${Date.now()}`
  ensureDirectory(targetPath)
  try {
    await unzip(zipFilePath, targetPath)
    const manifest = readJson(`${targetPath}/manifest.json`)
    const payload = readJson(`${targetPath}/data.json`)
    if (manifest.format !== 'zaofan-backup' || manifest.version !== 1) throw new AppError('BACKUP', '备份版本不兼容')
    if (!Array.isArray(payload.recipes) || payload.recipes.length !== manifest.recipeCount) throw new AppError('BACKUP', '菜谱数量与清单不一致')
    payload.recipes.forEach((recipe) => {
      if (recipe.imagePath && (!String(recipe.imagePath).startsWith('images/') || String(recipe.imagePath).includes('..'))) throw new AppError('BACKUP', '备份包含不安全的图片路径')
      if (recipe.imagePath) fs.statSync(`${targetPath}/${recipe.imagePath}`)
    })
    const localIds = new Set(recipeStore.all().map((item) => item.id))
    const conflicts = payload.recipes.filter((item) => localIds.has(item.id)).length
    logger.info('backup', 'import_validated', { operationId, result: 'success', stage: 'validate', message: `records=${payload.recipes.length};conflicts=${conflicts}` })
    return { manifest, payload, targetPath, conflicts }
  } catch (error) {
    await removeDirectory(targetPath)
    logger.error('backup', 'import_validation_failed', { operationId, result: 'failure', stage: 'validate', message: error })
    throw error instanceof AppError ? error : new AppError('BACKUP', error.message || '备份校验失败', error)
  }
}

function copyFile(source, target) {
  return new Promise((resolve, reject) => fs.copyFile({ srcPath: source, destPath: target, success: resolve, fail: reject }))
}

async function commitBackup(preview, strategy) {
  const operationId = randomId('backup')
  const oldRecipes = recipeStore.all()
  const oldHistory = historyStore.all()
  const oldSettings = settingsStore.get()
  const current = new Map(oldRecipes.map((item) => [item.id, item]))
  const createdImages = []
  const replacedImages = []
  const imageDirectory = `${wx.env.USER_DATA_PATH}/recipe-images`
  ensureDirectory(imageDirectory)
  try {
    for (const imported of preview.payload.recipes) {
      const exists = current.get(imported.id)
      if (exists && strategy === 'keep') continue
      const next = { ...imported }
      if (exists && strategy === 'copy') {
        next.id = randomId('recipe')
        next.name = `${next.name || '待完善菜谱'}（导入副本）`
        next.createdAt = new Date().toISOString()
        next.updatedAt = next.createdAt
      }
      if (imported.imagePath) {
        const ext = extensionOf(imported.imagePath) || 'jpg'
        const destination = `${imageDirectory}/${next.id}-${Date.now()}.${ext}`
        await copyFile(`${preview.targetPath}/${imported.imagePath}`, destination)
        createdImages.push(destination)
        next.imagePath = destination
        next.imageAiReady = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
      } else next.imagePath = ''
      if (exists && strategy === 'overwrite' && exists.imagePath) replacedImages.push(exists.imagePath)
      current.set(next.id, next)
    }
    recipeStore.replaceAll(Array.from(current.values()))
    historyStore.replaceAll(oldHistory.concat(preview.payload.history || []).slice(-100))
    const importedSettings = preview.payload.settings || {}
    settingsStore.put({
      ...oldSettings,
      debugMode: Boolean(importedSettings.debugMode),
      nutrition: importedSettings.nutrition || oldSettings.nutrition,
      ai: oldSettings.ai,
    })
    for (const path of replacedImages) await deleteRecipeImage(path)
    await removeDirectory(preview.targetPath)
    logger.info('backup', 'import_committed', { operationId, result: 'success', stage: 'commit', message: `records=${preview.payload.recipes.length};strategy=${strategy}` })
    return Array.from(current.values())
  } catch (error) {
    createdImages.forEach((path) => { try { fs.unlinkSync(path) } catch (_) { /* rollback */ } })
    recipeStore.replaceAll(oldRecipes)
    historyStore.replaceAll(oldHistory)
    settingsStore.put(oldSettings)
    logger.error('backup', 'import_rolled_back', { operationId, result: 'failure', stage: 'rollback', message: error })
    throw new AppError('BACKUP', '导入失败，已恢复原有数据', error)
  }
}

async function discardPreview(preview) {
  if (preview && preview.targetPath) await removeDirectory(preview.targetPath)
}

function createDiagnosticFile() {
  const directory = `${wx.env.USER_DATA_PATH}/diagnostics`
  ensureDirectory(directory)
  const path = `${directory}/灶房脱敏日志-${new Date().toISOString().slice(0, 10)}.json`
  fs.writeFileSync(path, JSON.stringify({ exportedAt: new Date().toISOString(), logs: logStore.all() }, null, 2), 'utf8')
  return path
}

module.exports = { CHUNK_SIZE, utf8Encode, utf8Decode, crc32, createZip, createBackup, inspectBackup, commitBackup, discardPreview, createDiagnosticFile, safeFilename }
