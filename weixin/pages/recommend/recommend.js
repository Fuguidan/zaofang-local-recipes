const { recipeStore, historyStore, settingsStore } = require('../../utils/storage')
const { MEALS, FLAVORS } = require('../../utils/constants')
const { recommendRecipes } = require('../../utils/recommendation')
const { nutrientChips } = require('../../utils/nutrition')
const { randomId } = require('../../utils/id')
const { logger } = require('../../utils/logger')
const { showAppError } = require('../../utils/errors')

Page({
  data: {
    people: 2,
    meals: MEALS,
    mealIndex: 2,
    flavors: FLAVORS.map((value) => ({ value, checked: false })),
    tagsText: '',
    result: null,
    selected: [],
    fixedIds: [],
    recipeCount: 0,
  },

  onShow() {
    this.recipes = recipeStore.all()
    this.history = historyStore.all()
    this.settings = settingsStore.get()
    this.setData({ recipeCount: this.recipes.length })
  },

  peopleInput(event) { this.setData({ people: Number(event.detail.value) }) },
  mealChange(event) { this.setData({ mealIndex: Number(event.detail.value) }) },
  flavorChange(event) {
    const selected = event.detail.value
    this.setData({ flavors: FLAVORS.map((value) => ({ value, checked: selected.includes(value) })) })
  },
  tagsInput(event) { this.setData({ tagsText: event.detail.value }) },

  generate(event) {
    const preserveFixed = event && event.currentTarget.dataset.preserve === 'true'
    const fixedIds = preserveFixed ? this.data.fixedIds : []
    const avoidIds = preserveFixed ? this.data.selected.filter((item) => !fixedIds.includes(item.id)).map((item) => item.id) : []
    this.runRecommendation(fixedIds, avoidIds, fixedIds)
  },

  runRecommendation(selectionFixedIds, avoidIds, persistentFixedIds) {
    const operationId = randomId('recommend')
    const started = Date.now()
    try {
      const meal = MEALS[this.data.mealIndex].value
      const request = {
        people: Number(this.data.people),
        meal,
        flavors: this.data.flavors.filter((item) => item.checked).map((item) => item.value),
        tags: String(this.data.tagsText || '').split(/[，,、]/).map((item) => item.trim()).filter(Boolean),
      }
      const result = recommendRecipes(this.recipes, request, this.history, selectionFixedIds, Math.random(), avoidIds)
      const selected = result.recipes.map((recipe) => ({ ...recipe, fixed: persistentFixedIds.includes(recipe.id), nutritionChips: nutrientChips(recipe, this.settings) }))
      const historyItem = { id: randomId('history'), recipeIds: result.recipes.map((item) => item.id), meal, createdAt: new Date().toISOString() }
      historyStore.add(historyItem)
      this.history.push(historyItem)
      this.setData({ result, selected, fixedIds: persistentFixedIds })
      logger.info('recommendation', 'generated', { operationId, result: 'success', durationMs: Date.now() - started, message: `candidates=${this.recipes.length};selected=${selected.length};target=${result.targetCount};avoided=${avoidIds.length};replaced=${avoidIds.filter((id) => !selected.some((item) => item.id === id)).length}` })
    } catch (error) {
      const appError = showAppError(error, 'RECOMMENDATION')
      logger.error('recommendation', 'generate_failed', { operationId, errorCode: appError.code, message: appError.message })
    }
  },

  toggleFixed(event) {
    const id = event.currentTarget.dataset.id
    const fixedIds = this.data.fixedIds.includes(id) ? this.data.fixedIds.filter((item) => item !== id) : this.data.fixedIds.concat(id)
    this.setData({ fixedIds, selected: this.data.selected.map((item) => ({ ...item, fixed: fixedIds.includes(item.id) })) })
  },

  replaceRecipe(event) {
    const id = event.currentTarget.dataset.id
    const keep = this.data.selected.filter((item) => item.id !== id).map((item) => item.id)
    const persistentFixedIds = this.data.fixedIds.filter((fixedId) => fixedId !== id)
    this.runRecommendation(keep, [id], persistentFixedIds)
  },
  openRecipe(event) { wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` }) },
})
