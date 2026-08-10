const { recipeStore, settingsStore } = require('../../utils/storage')
const { nutrientChips, calculateRecipeNutrition, formatFoodLabel } = require('../../utils/nutrition')
const { deleteRecipeImage } = require('../../utils/image')
const { logger } = require('../../utils/logger')
const { showAppError } = require('../../utils/errors')

Page({
  data: { recipe: null, nutritionChips: [], ingredientDetails: [], nutritionComplete: false },

  onLoad(options) { this.recipeId = options.id },
  onShow() { this.loadRecipe() },

  loadRecipe() {
    const recipe = recipeStore.get(this.recipeId)
    if (!recipe) {
      wx.showToast({ title: '菜谱不存在', icon: 'none' })
      return setTimeout(() => wx.navigateBack(), 500)
    }
    const settings = settingsStore.get()
    const nutrition = calculateRecipeNutrition(recipe.ingredients)
    const ingredientDetails = (recipe.ingredients || []).map((item) => ({
      ...item,
      foodLabel: item.food ? formatFoodLabel(item.food, item.name) : '未匹配标准食材',
    }))
    this.setData({ recipe, nutritionChips: nutrientChips(recipe, settings), ingredientDetails, nutritionComplete: nutrition.complete })
    wx.setNavigationBarTitle({ title: recipe.name || '待完善菜谱' })
  },

  editRecipe() { wx.navigateTo({ url: `/pages/editor/editor?id=${this.recipeId}` }) },

  deleteRecipe() {
    wx.showModal({
      title: '删除这道菜谱？',
      content: '菜谱和关联图片会从当前设备移除，此操作无法撤销。',
      confirmText: '删除',
      confirmColor: '#8b2e2e',
      success: async (result) => {
        if (!result.confirm) return
        try {
          const recipe = recipeStore.get(this.recipeId)
          recipeStore.delete(this.recipeId)
          await deleteRecipeImage(recipe && recipe.imagePath)
          logger.info('recipe', 'delete_success', { result: 'success', message: `id=${this.recipeId}` })
          wx.showToast({ title: '已删除' })
          setTimeout(() => wx.navigateBack(), 500)
        } catch (error) { showAppError(error, 'STORAGE') }
      },
    })
  },
})
