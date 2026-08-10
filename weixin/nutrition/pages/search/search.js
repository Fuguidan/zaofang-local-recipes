const nutritionData = require('../../data/nutrition-foods.js')
const { COMMON_FOODS } = require('../../../utils/nutrition')

const ALIASES = Object.fromEntries(COMMON_FOODS.map((food) => [food.alias, food.name.toLowerCase().split(',')[0]]))

function expandedTerms(query) {
  const normalized = String(query || '').trim().toLowerCase().replace(/[，、]/g, ' ').replace(/\s+/g, ' ')
  const translated = Object.keys(ALIASES).filter((alias) => normalized.includes(alias)).map((alias) => ALIASES[alias])
  return translated.length ? translated : [normalized]
}

function searchFoods(query, limit) {
  const terms = expandedTerms(query).filter(Boolean)
  if (!terms.length) return []
  return nutritionData.foods
    .map((food) => {
      const name = food.name.toLowerCase()
      let score = 0
      terms.forEach((term) => {
        const words = term.split(' ').filter(Boolean)
        if (name === term) score = Math.max(score, 120)
        else if (name.startsWith(term)) score = Math.max(score, 100)
        else if (name.includes(term)) score = Math.max(score, 80)
        else if (words.every((word) => name.includes(word))) score = Math.max(score, 60)
      })
      if (String(food.source).startsWith('usda-foundation')) score += 3
      return { food, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length)
    .slice(0, limit || 20)
    .map((item) => ({
      ...item.food,
      displayName: `${String(query || '').trim().slice(0, 16) || '标准食材'} ｜ ${item.food.name}`,
      nutrientText: `每100g：${Math.round(item.food.nutrients.energyKcal || 0)} kcal · 蛋白质 ${Number(item.food.nutrients.proteinG || 0).toFixed(1)}g`,
    }))
}

Page({
  data: { query: '', results: [], count: nutritionData.count, version: nutritionData.version },

  onLoad(options) {
    const query = decodeURIComponent(options.query || '')
    this.setData({ query })
    this.runSearch(query)
  },

  onInput(event) {
    const query = event.detail.value
    this.setData({ query })
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.runSearch(query), 180)
  },

  runSearch(query) { this.setData({ results: searchFoods(query, 20) }) },

  selectFood(event) {
    const food = this.data.results[Number(event.currentTarget.dataset.index)]
    if (!food) return
    const copy = { id: food.id, name: food.name, source: food.source, sourceRecordId: food.sourceRecordId, nutrients: food.nutrients }
    this.getOpenerEventChannel().emit('foodSelected', copy)
    wx.navigateBack()
  },
})
