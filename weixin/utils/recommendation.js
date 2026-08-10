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

function recommendRecipes(recipes, request, history, fixedIds, salt) {
  const people = Number(request.people)
  if (!Number.isInteger(people) || people < 1 || people > 20) throw new AppError('RECOMMENDATION', '人数应为 1 到 20 的整数')
  const targetCount = people + 1
  const recent = new Set((history || []).slice(-5).reduce((ids, item) => ids.concat(item.recipeIds || []), []))
  const fixed = (fixedIds || []).map((id) => recipes.find((item) => item.id === id)).filter(Boolean)
  const seed = Number.isFinite(salt) ? salt : Math.random()
  const ranked = recipes
    .filter((recipe) => !(fixedIds || []).includes(recipe.id))
    .map((recipe, index) => ({ recipe, score: scoreRecipe(recipe, request, recent), tie: (index + seed) % 1 }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
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
