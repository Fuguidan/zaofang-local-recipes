const assert = require('node:assert/strict')
const test = require('node:test')

const values = new Map()
global.wx = {
  getStorageSync(key) { return values.has(key) ? structuredClone(values.get(key)) : '' },
  setStorageSync(key, value) { values.set(key, structuredClone(value)) },
}

const { initializeStorage, recipeStore, settingsStore, historyStore, logStore, clearBusinessData } = require('../utils/storage')

test('completes local recipe create, update, delete and persistence flow', () => {
  values.clear()
  initializeStorage()
  const recipe = { id: 'r1', name: '番茄炒蛋', ingredients: [], steps: [], updatedAt: '2026-08-10T10:00:00.000Z' }
  recipeStore.put(recipe)
  assert.equal(recipeStore.get('r1').name, '番茄炒蛋')
  recipeStore.put({ ...recipe, name: '西红柿炒鸡蛋', updatedAt: '2026-08-10T11:00:00.000Z' })
  assert.equal(recipeStore.all().length, 1)
  assert.equal(recipeStore.get('r1').name, '西红柿炒鸡蛋')
  recipeStore.delete('r1')
  assert.equal(recipeStore.get('r1'), undefined)
})

test('clears only business data and preserves settings and diagnostics', () => {
  values.clear()
  initializeStorage()
  recipeStore.put({ id: 'r1', name: '菜谱', updatedAt: new Date().toISOString() })
  historyStore.add({ id: 'h1' })
  settingsStore.put({ ...settingsStore.get(), debugMode: true })
  logStore.add({ id: 'l1', timestamp: new Date().toISOString() })
  clearBusinessData()
  assert.equal(recipeStore.all().length, 0)
  assert.equal(historyStore.all().length, 0)
  assert.equal(settingsStore.get().debugMode, true)
  assert.equal(logStore.all().length, 1)
})
