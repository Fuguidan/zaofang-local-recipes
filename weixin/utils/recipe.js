const { randomId } = require('./id')
const { MEALS } = require('./constants')

function normalizeRecipeName(name) {
  const value = String(name || '')
  const normalized = typeof value.normalize === 'function' ? value.normalize('NFKC') : value
  return normalized.trim().replace(/\s+/g, ' ').toLowerCase()
}

function findDuplicateRecipeByName(recipes, name, excludeId) {
  const normalized = normalizeRecipeName(name)
  if (!normalized) return undefined
  return recipes.find((recipe) => recipe.id !== excludeId && normalizeRecipeName(recipe.name) === normalized)
}

function emptyIngredient() {
  return { id: randomId('ingredient'), name: '', amount: '', unit: '', grams: '', note: '', nutritionMatch: 'unmatched' }
}

function emptyRecipeDraft() {
  return {
    name: '',
    description: '',
    ingredients: [emptyIngredient()],
    steps: [''],
    meals: [],
    flavors: [],
    tagsText: '',
    dietType: '荤菜',
    duration: 30,
    difficulty: '简单',
    imagePath: '',
    imageName: '',
    imageAiReady: false,
  }
}

function recipeToDraft(recipe) {
  return {
    ...emptyRecipeDraft(),
    ...recipe,
    ingredients: recipe.ingredients && recipe.ingredients.length
      ? recipe.ingredients.map((item) => ({ ...item, grams: item.grams || '' }))
      : [emptyIngredient()],
    steps: recipe.steps && recipe.steps.length ? recipe.steps.slice() : [''],
    tagsText: (recipe.tags || []).join('，'),
  }
}

function sanitizeDraft(draft) {
  const now = new Date().toISOString()
  return {
    name: String(draft.name || '').trim(),
    description: String(draft.description || '').trim(),
    ingredients: (draft.ingredients || [])
      .map((item) => ({
        ...item,
        id: item.id || randomId('ingredient'),
        name: String(item.name || '').trim(),
        amount: String(item.amount || '').trim(),
        unit: String(item.unit || '').trim(),
        grams: Number(item.grams) > 0 ? Number(item.grams) : undefined,
        note: String(item.note || '').trim() || undefined,
      }))
      .filter((item) => item.name || item.amount || item.unit),
    steps: (draft.steps || []).map((step) => String(step || '').trim()).filter(Boolean),
    meals: Array.isArray(draft.meals) ? draft.meals : [],
    flavors: Array.isArray(draft.flavors) ? draft.flavors : [],
    tags: String(draft.tagsText || '').split(/[，,、]/).map((tag) => tag.trim()).filter(Boolean),
    dietType: draft.dietType || '荤菜',
    duration: Math.max(0, Math.round(Number(draft.duration) || 0)),
    difficulty: draft.difficulty || '简单',
    imagePath: draft.imagePath || '',
    imageName: draft.imageName || '',
    imageAiReady: Boolean(draft.imageAiReady),
    incomplete: !String(draft.name || '').trim() || !(draft.ingredients || []).some((item) => String(item.name || '').trim()) || !(draft.steps || []).some((step) => String(step || '').trim()),
    updatedAt: now,
  }
}

function mealLabel(value) {
  const match = MEALS.find((item) => item.value === value)
  return match ? match.label : value
}

function paginate(items, page, size) {
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.max(1, Math.min(totalPages, Number(page) || 1))
  return { page: current, totalPages, items: items.slice((current - 1) * size, current * size) }
}

module.exports = {
  normalizeRecipeName,
  findDuplicateRecipeByName,
  emptyIngredient,
  emptyRecipeDraft,
  recipeToDraft,
  sanitizeDraft,
  mealLabel,
  paginate,
}
