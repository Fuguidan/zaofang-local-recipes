const { AppError } = require('./errors')

function scoreRecipe(recipe, request, recentIds) {
  if (!(recipe.meals || []).includes(request.meal)) return -1
  let score = 50
  score += (request.flavors || []).filter((value) => (recipe.flavors || []).includes(value)).length * 14
  score += (request.tags || []).filter((value) => (recipe.tags || []).includes(value)).length * 10
  if (!recentIds.has(recipe.id)) score += 8
  if (!recipe.incomplete) score += 4
  return score
}

function seededTie(id, salt) {
  let value = (Math.floor(Math.abs(salt % 1) * 0xffffffff) ^ 0x9e3779b9) >>> 0
  for (let index = 0; index < String(id).length; index += 1) value = Math.imul(value ^ String(id).charCodeAt(index), 0x85ebca6b) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d) >>> 0
  value ^= value >>> 15
  return value / 0x100000000
}

function recommendRecipes(recipes, request, history, fixedIds, salt, avoidIds) {
  const people = Number(request.people)
  if (!Number.isInteger(people) || people < 1 || people > 20) throw new AppError('RECOMMENDATION', '人数应为 1 到 20 的整数')
  const targetCount = people + 1
  const recent = new Set([...(history || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-5).reduce((ids, item) => ids.concat(item.recipeIds || []), []))
  const fixed = (fixedIds || []).map((id) => recipes.find((item) => item.id === id)).filter(Boolean)
  const avoid = new Set((avoidIds || []).filter((id) => !(fixedIds || []).includes(id)))
  const seed = Number.isFinite(salt) ? salt : Math.random()
  const ranked = recipes
    .filter((recipe) => !(fixedIds || []).includes(recipe.id))
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, request, recent), avoided: avoid.has(recipe.id), tie: seededTie(recipe.id, seed) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => Number(a.avoided) - Number(b.avoided) || b.score - a.score || a.tie - b.tie)
    .map((item) => item.recipe)
  const selected = fixed.concat(ranked).slice(0, targetCount)
  const shortage = Math.max(0, targetCount - selected.length)
  return {
    targetCount,
    recipes: selected,
    shortage,
    reason: shortage
      ? `符合条件的菜谱不足，还差 ${shortage} 道。可减少口味或标签限制。`
      : `已按 ${people} 人和餐次口味推荐 ${selected.length} 道菜。`,
  }
}

module.exports = { recommendRecipes }
