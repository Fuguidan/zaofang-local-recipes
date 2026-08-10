const { recipeStore, settingsStore, getViewMode, setViewMode } = require('../../utils/storage')
const { paginate } = require('../../utils/recipe')
const { nutrientChips } = require('../../utils/nutrition')

const PAGE_SIZE = 10

Page({
  data: {
    search: '',
    mode: 'list',
    recipes: [],
    visibleRecipes: [],
    page: 1,
    totalPages: 1,
    rangeText: '',
  },

  onShow() {
    this.loadRecipes()
  },

  loadRecipes() {
    const recipes = recipeStore.all()
    this.setData({ recipes, mode: getViewMode() })
    this.applyFilter(1)
  },

  applyFilter(nextPage) {
    const keyword = String(this.data.search || '').trim().toLowerCase()
    const filtered = this.data.recipes.filter((recipe) => {
      if (!keyword) return true
      return [recipe.name, recipe.description]
        .concat(recipe.tags || [], (recipe.ingredients || []).map((item) => item.name))
        .join(' ').toLowerCase().includes(keyword)
    })
    const pageData = paginate(filtered, nextPage || this.data.page, PAGE_SIZE)
    const settings = settingsStore.get()
    const visibleRecipes = pageData.items.map((recipe) => ({
      ...recipe,
      displayName: recipe.name || '待完善菜谱',
      nutritionChips: nutrientChips(recipe, settings),
      tagPreview: (recipe.tags || []).slice(0, 3),
    }))
    const start = filtered.length ? (pageData.page - 1) * PAGE_SIZE + 1 : 0
    const end = Math.min(filtered.length, pageData.page * PAGE_SIZE)
    this.setData({ visibleRecipes, page: pageData.page, totalPages: pageData.totalPages, rangeText: `${start}–${end} / ${filtered.length}` })
  },

  onSearch(event) {
    this.setData({ search: event.detail.value })
    this.applyFilter(1)
  },

  setListMode() { setViewMode('list'); this.setData({ mode: 'list' }) },
  setTileMode() { setViewMode('tiles'); this.setData({ mode: 'tiles' }) },
  previousPage() { this.applyFilter(this.data.page - 1) },
  nextPage() { this.applyFilter(this.data.page + 1) },
  addRecipe() { wx.navigateTo({ url: '/pages/editor/editor' }) },
  openRecipe(event) { wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` }) },
})
