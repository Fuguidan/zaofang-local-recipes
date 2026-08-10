const { recipeStore, settingsStore } = require('../../utils/storage')
const { MEALS, FLAVORS, DIET_TYPES, DIFFICULTIES } = require('../../utils/constants')
const { randomId } = require('../../utils/id')
const { emptyRecipeDraft, emptyIngredient, recipeToDraft, sanitizeDraft, findDuplicateRecipeByName } = require('../../utils/recipe')
const { chooseRecipeImage, normalizePickedImage, persistRecipeImage, isAiSupportedPath } = require('../../utils/image')
const { suggestIngredientNutrition, formatFoodLabel } = require('../../utils/nutrition')
const { generateRecipeDraft, supportsThinking } = require('../../utils/ai')
const { logger } = require('../../utils/logger')
const { showAppError, AppError } = require('../../utils/errors')

Page({
  data: {
    draft: emptyRecipeDraft(),
    isEdit: false,
    meals: MEALS.map((item) => ({ ...item, checked: false })),
    flavors: FLAVORS.map((value) => ({ value, checked: false })),
    dietTypes: DIET_TYPES,
    difficulties: DIFFICULTIES,
    dietIndex: 0,
    difficultyIndex: 0,
    aiEnabled: false,
    aiConfigured: false,
    aiModel: '',
    thinkingSupported: false,
    thinkingEnabled: false,
    processingImage: false,
    generating: false,
    imageNotice: '',
    aiNotice: '',
  },

  onLoad(options) {
    this.recipeId = options.id || ''
    this.originalRecipe = this.recipeId ? recipeStore.get(this.recipeId) : undefined
    const draft = this.originalRecipe ? recipeToDraft(this.originalRecipe) : emptyRecipeDraft()
    this.setData({
      draft,
      isEdit: Boolean(this.originalRecipe),
      meals: MEALS.map((item) => ({ ...item, checked: draft.meals.includes(item.value) })),
      flavors: FLAVORS.map((value) => ({ value, checked: draft.flavors.includes(value) })),
      dietIndex: Math.max(0, DIET_TYPES.indexOf(draft.dietType)),
      difficultyIndex: Math.max(0, DIFFICULTIES.indexOf(draft.difficulty)),
    })
    wx.setNavigationBarTitle({ title: this.originalRecipe ? '修改菜谱' : '添加菜谱' })
    this.loadSettings()
  },

  onShow() { this.loadSettings() },

  loadSettings() {
    const settings = settingsStore.get()
    const configured = Boolean(settings.ai.endpoint && settings.ai.model && settings.ai.apiKey)
    this.settings = settings
    this.setData({
      aiEnabled: Boolean(settings.ai.enabled),
      aiConfigured: configured,
      aiModel: settings.ai.model,
      thinkingSupported: supportsThinking(settings.ai.endpoint),
      thinkingEnabled: Boolean(settings.ai.thinkingEnabled),
    })
  },

  inputField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`draft.${field}`]: event.detail.value })
  },

  mealChange(event) {
    const selected = event.detail.value
    this.setData({ 'draft.meals': selected, meals: MEALS.map((item) => ({ ...item, checked: selected.includes(item.value) })) })
  },
  flavorChange(event) {
    const selected = event.detail.value
    this.setData({ 'draft.flavors': selected, flavors: FLAVORS.map((value) => ({ value, checked: selected.includes(value) })) })
  },
  dietChange(event) {
    const index = Number(event.detail.value)
    this.setData({ dietIndex: index, 'draft.dietType': DIET_TYPES[index] })
  },
  difficultyChange(event) {
    const index = Number(event.detail.value)
    this.setData({ difficultyIndex: index, 'draft.difficulty': DIFFICULTIES[index] })
  },

  ingredientInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    const ingredients = this.data.draft.ingredients.slice()
    ingredients[index] = { ...ingredients[index], [field]: event.detail.value }
    if (['name', 'amount', 'unit', 'grams'].includes(field)) ingredients[index] = suggestIngredientNutrition(ingredients[index])
    this.setData({ 'draft.ingredients': ingredients })
  },
  addIngredient() { this.setData({ 'draft.ingredients': this.data.draft.ingredients.concat(emptyIngredient()) }) },
  removeIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    const ingredients = this.data.draft.ingredients.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ 'draft.ingredients': ingredients.length ? ingredients : [emptyIngredient()] })
  },
  moveIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const target = index + direction
    if (target < 0 || target >= this.data.draft.ingredients.length) return
    const ingredients = this.data.draft.ingredients.slice()
    ;[ingredients[index], ingredients[target]] = [ingredients[target], ingredients[index]]
    this.setData({ 'draft.ingredients': ingredients })
  },
  selectFood(event) {
    const index = Number(event.currentTarget.dataset.index)
    const ingredient = this.data.draft.ingredients[index]
    wx.navigateTo({
      url: `/nutrition/pages/search/search?query=${encodeURIComponent(ingredient.name || '')}`,
      events: {
        foodSelected: (food) => {
          const ingredients = this.data.draft.ingredients.slice()
          ingredients[index] = { ...ingredients[index], food, foodId: food.id, foodName: food.name, nutritionMatch: 'confirmed', foodLabel: formatFoodLabel(food, ingredients[index].name) }
          this.setData({ 'draft.ingredients': ingredients })
        },
      },
    })
  },

  stepInput(event) {
    const steps = this.data.draft.steps.slice()
    steps[Number(event.currentTarget.dataset.index)] = event.detail.value
    this.setData({ 'draft.steps': steps })
  },
  addStep() { this.setData({ 'draft.steps': this.data.draft.steps.concat('') }) },
  removeStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    const steps = this.data.draft.steps.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ 'draft.steps': steps.length ? steps : [''] })
  },
  moveStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = index + Number(event.currentTarget.dataset.direction)
    if (target < 0 || target >= this.data.draft.steps.length) return
    const steps = this.data.draft.steps.slice()
    ;[steps[index], steps[target]] = [steps[target], steps[index]]
    this.setData({ 'draft.steps': steps })
  },

  async chooseImage() {
    try {
      const selected = await chooseRecipeImage()
      if (!selected) return
      this.setData({ processingImage: true, imageNotice: '正在处理图片…' })
      const result = await normalizePickedImage(selected.tempFilePath)
      this.setData({
        'draft.imagePath': result.path,
        'draft.imageName': result.imageName,
        'draft.imageAiReady': result.aiReady,
        imageNotice: result.notice,
      })
      logger.info('image', 'upload_processed', { result: result.aiReady ? 'ai_ready' : 'preserved', message: `extension=${result.imageName.split('.').pop()}` })
    } catch (error) { showAppError(error, 'IMAGE') } finally { this.setData({ processingImage: false }) }
  },

  editImage() {
    if (!this.data.draft.imagePath) return
    wx.navigateTo({
      url: '/pages/image-editor/image-editor',
      events: {
        imageEdited: (result) => this.setData({
          'draft.imagePath': result.path,
          'draft.imageName': `菜品-${Date.now()}.jpg`,
          'draft.imageAiReady': true,
          imageNotice: '已按编辑预览裁剪为 JPEG，封面将保持一致。',
        }),
      },
      success: (result) => result.eventChannel.emit('imageSource', { path: this.data.draft.imagePath }),
    })
  },
  removeImage() { this.setData({ 'draft.imagePath': '', 'draft.imageName': '', 'draft.imageAiReady': false, imageNotice: '图片将在保存后移除。' }) },

  setThinking(event) { this.setData({ thinkingEnabled: event.currentTarget.dataset.value === 'true' }) },

  async generate(event) {
    const mode = event.currentTarget.dataset.mode
    if (this.data.generating) return
    const hasText = Boolean(String(this.data.draft.name || '').trim() || String(this.data.draft.description || '').trim())
    const hasImage = Boolean(this.data.draft.imagePath && this.data.draft.imageAiReady && isAiSupportedPath(this.data.draft.imagePath))
    if (mode === 'text' && !hasText) return showAppError(new AppError('VALIDATION', '请先填写菜名或原始说明'))
    if (mode === 'image' && !hasImage) return showAppError(new AppError('VALIDATION', '当前图片暂不能用于图片 AI，请编辑转为 JPEG 或改用文字生成'))
    try {
      this.setData({ generating: true, aiNotice: mode === 'image' ? '正在识别图片并生成菜谱…' : '正在根据文字生成菜谱…' })
      const result = await generateRecipeDraft({
        mode,
        imagePath: mode === 'image' ? this.data.draft.imagePath : '',
        name: this.data.draft.name,
        description: this.data.draft.description,
        estimatePeople: this.settings.nutrition.estimatePeople,
        config: this.settings.ai,
        thinkingEnabled: this.data.thinkingEnabled,
      })
      const draft = {
        ...this.data.draft,
        ...result,
        tagsText: (result.tags || []).join('，'),
        imagePath: this.data.draft.imagePath,
        imageName: this.data.draft.imageName,
        imageAiReady: this.data.draft.imageAiReady,
      }
      this.setData({
        draft,
        meals: MEALS.map((item) => ({ ...item, checked: draft.meals.includes(item.value) })),
        flavors: FLAVORS.map((value) => ({ value, checked: draft.flavors.includes(value) })),
        dietIndex: Math.max(0, DIET_TYPES.indexOf(draft.dietType)),
        difficultyIndex: Math.max(0, DIFFICULTIES.indexOf(draft.difficulty)),
        aiNotice: '已生成到编辑表单，请检查食材克数和步骤后保存。',
      })
    } catch (error) {
      const appError = showAppError(error, 'NETWORK')
      this.setData({ aiNotice: `生成失败：${error.suggestion || appError.message} 原图片和文字已保留。` })
    } finally { this.setData({ generating: false }) }
  },

  saveRecipe() {
    const duplicate = findDuplicateRecipeByName(recipeStore.all(), this.data.draft.name, this.recipeId)
    if (duplicate) {
      wx.showModal({
        title: '已存在同名菜谱',
        content: `本机已有“${duplicate.name || '待完善菜谱'}”。为避免重复，建议返回修改菜名。是否仍然保存？`,
        cancelText: '返回修改',
        confirmText: '仍然保存',
        success: (result) => { if (result.confirm) this.commitSave() },
      })
      logger.warn('recipe', 'duplicate_name_detected', { stage: 'confirm' })
      return
    }
    this.commitSave()
  },

  async commitSave() {
    const operationId = randomId('recipe')
    const started = Date.now()
    const id = this.recipeId || randomId('recipe')
    const previousPath = this.originalRecipe && this.originalRecipe.imagePath
    try {
      const sanitized = sanitizeDraft(this.data.draft)
      const persistedPath = await persistRecipeImage(sanitized.imagePath, id, previousPath)
      const now = new Date().toISOString()
      const recipe = {
        ...sanitized,
        id,
        imagePath: persistedPath,
        imageAiReady: Boolean(persistedPath && isAiSupportedPath(persistedPath)),
        createdAt: this.originalRecipe ? this.originalRecipe.createdAt : now,
        updatedAt: now,
      }
      recipeStore.put(recipe)
      logger.info('recipe', this.originalRecipe ? 'update_success' : 'create_success', { operationId, result: 'success', durationMs: Date.now() - started, message: `id=${id};incomplete=${recipe.incomplete}` })
      wx.showToast({ title: '已保存到本机' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      const appError = showAppError(error, 'STORAGE')
      logger.error('recipe', 'save_failed', { operationId, result: 'failure', durationMs: Date.now() - started, errorCode: appError.code, message: appError.message })
    }
  },

  cancel() { wx.navigateBack() },
})
