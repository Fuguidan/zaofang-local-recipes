const { DEFAULT_SETTINGS } = require('./constants')
const { AppError } = require('./errors')

const KEYS = {
  recipes: 'zaofang.recipes.v1',
  settings: 'zaofang.settings.v1',
  history: 'zaofang.history.v1',
  logs: 'zaofang.logs.v1',
  view: 'zaofang.recipe-view.v1',
}
const LOG_LIMIT = 500

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function safeGet(key, fallback) {
  try {
    const value = wx.getStorageSync(key)
    return value === '' || value === undefined || value === null ? clone(fallback) : value
  } catch (error) {
    throw new AppError('STORAGE', '读取本机数据失败', error)
  }
}

function safeSet(key, value) {
  try {
    wx.setStorageSync(key, value)
    return value
  } catch (error) {
    throw new AppError('STORAGE', '保存到本机失败，可能是存储空间不足', error)
  }
}

function mergedSettings(saved) {
  const value = saved || {}
  const nutrition = value.nutrition || {}
  const visible = Array.isArray(nutrition.visibleNutrients)
    ? nutrition.visibleNutrients
    : DEFAULT_SETTINGS.nutrition.visibleNutrients
  return {
    ...clone(DEFAULT_SETTINGS),
    ...value,
    ai: { ...DEFAULT_SETTINGS.ai, ...(value.ai || {}) },
    nutrition: {
      visibleNutrients: visible,
      estimatePeople: Math.max(1, Math.min(20, Math.round(Number(nutrition.estimatePeople) || 2))),
    },
  }
}

function initializeStorage() {
  if (!Array.isArray(wx.getStorageSync(KEYS.recipes))) safeSet(KEYS.recipes, [])
  if (!Array.isArray(wx.getStorageSync(KEYS.history))) safeSet(KEYS.history, [])
  if (!Array.isArray(wx.getStorageSync(KEYS.logs))) safeSet(KEYS.logs, [])
  safeSet(KEYS.settings, mergedSettings(wx.getStorageSync(KEYS.settings)))
}

const recipeStore = {
  all: () => safeGet(KEYS.recipes, []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
  get: (id) => safeGet(KEYS.recipes, []).find((item) => item.id === id),
  put(recipe) {
    const current = safeGet(KEYS.recipes, [])
    const index = current.findIndex((item) => item.id === recipe.id)
    if (index >= 0) current[index] = recipe
    else current.unshift(recipe)
    safeSet(KEYS.recipes, current)
    return recipe
  },
  delete(id) {
    safeSet(KEYS.recipes, safeGet(KEYS.recipes, []).filter((item) => item.id !== id))
  },
  replaceAll(recipes) { safeSet(KEYS.recipes, recipes) },
}

const settingsStore = {
  get: () => mergedSettings(safeGet(KEYS.settings, DEFAULT_SETTINGS)),
  put: (settings) => safeSet(KEYS.settings, mergedSettings(settings)),
}

const historyStore = {
  all: () => safeGet(KEYS.history, []),
  add(item) {
    const history = safeGet(KEYS.history, [])
    history.push(item)
    safeSet(KEYS.history, history.slice(-100))
  },
  replaceAll: (items) => safeSet(KEYS.history, Array.isArray(items) ? items.slice(-100) : []),
}

const logStore = {
  all: () => safeGet(KEYS.logs, []).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))),
  add(entry) {
    const logs = safeGet(KEYS.logs, [])
    logs.push(entry)
    safeSet(KEYS.logs, logs.slice(-LOG_LIMIT))
  },
  clear: () => safeSet(KEYS.logs, []),
}

function clearBusinessData() {
  safeSet(KEYS.recipes, [])
  safeSet(KEYS.history, [])
}

function getViewMode() { return safeGet(KEYS.view, 'list') === 'tiles' ? 'tiles' : 'list' }
function setViewMode(mode) { safeSet(KEYS.view, mode === 'tiles' ? 'tiles' : 'list') }

module.exports = { KEYS, initializeStorage, recipeStore, settingsStore, historyStore, logStore, clearBusinessData, getViewMode, setViewMode }
