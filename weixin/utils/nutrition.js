const { NUTRIENTS } = require('./constants')

const COMMON_FOODS = [
  ['鸡蛋', 'Egg, whole, cooked', 155, 12.6, 1.1, 10.6, 0, 124],
  ['鸡胸肉', 'Chicken breast, skinless, cooked', 165, 31, 0, 3.6, 0, 74],
  ['鸡腿', 'Chicken thigh, cooked', 209, 26, 0, 10.9, 0, 90],
  ['牛肉', 'Beef, lean, cooked', 250, 26, 0, 15, 0, 72],
  ['猪肉', 'Pork, lean, cooked', 242, 27, 0, 14, 0, 62],
  ['羊肉', 'Lamb, cooked', 294, 25, 0, 21, 0, 72],
  ['三文鱼', 'Salmon, cooked', 208, 20, 0, 13, 0, 59],
  ['虾', 'Shrimp, cooked', 99, 24, 0.2, 0.3, 0, 111],
  ['鳕鱼', 'Cod, cooked', 89, 19.9, 0, 0.7, 0, 78],
  ['豆腐', 'Tofu, firm', 144, 17.3, 2.8, 8.7, 2.3, 14],
  ['米饭', 'Rice, white, cooked', 130, 2.7, 28.2, 0.3, 0.4, 1],
  ['糙米', 'Rice, brown, cooked', 123, 2.7, 25.6, 1, 1.6, 4],
  ['面条', 'Noodles, cooked', 138, 4.5, 25, 2.1, 1.2, 5],
  ['燕麦', 'Oats, cooked', 71, 2.5, 12, 1.5, 1.7, 49],
  ['红薯', 'Sweet potato, cooked', 90, 2, 20.7, 0.2, 3.3, 36],
  ['土豆', 'Potato, cooked', 87, 1.9, 20.1, 0.1, 1.8, 4],
  ['玉米', 'Corn, sweet, cooked', 96, 3.4, 21, 1.5, 2.4, 1],
  ['番茄', 'Tomato, raw', 18, 0.9, 3.9, 0.2, 1.2, 5],
  ['西红柿', 'Tomato, raw', 18, 0.9, 3.9, 0.2, 1.2, 5],
  ['黄瓜', 'Cucumber, raw', 15, 0.7, 3.6, 0.1, 0.5, 2],
  ['胡萝卜', 'Carrot, raw', 41, 0.9, 9.6, 0.2, 2.8, 69],
  ['西兰花', 'Broccoli, raw', 34, 2.8, 6.6, 0.4, 2.6, 33],
  ['菠菜', 'Spinach, raw', 23, 2.9, 3.6, 0.4, 2.2, 79],
  ['生菜', 'Lettuce, raw', 15, 1.4, 2.9, 0.2, 1.3, 28],
  ['白菜', 'Napa cabbage, raw', 16, 1.2, 3.2, 0.2, 1.2, 9],
  ['芹菜', 'Celery, raw', 14, 0.7, 3, 0.2, 1.6, 80],
  ['茄子', 'Eggplant, raw', 25, 1, 5.9, 0.2, 3, 2],
  ['洋葱', 'Onion, raw', 40, 1.1, 9.3, 0.1, 1.7, 4],
  ['蘑菇', 'Mushroom, white, raw', 22, 3.1, 3.3, 0.3, 1, 5],
  ['南瓜', 'Pumpkin, cooked', 20, 0.7, 4.9, 0.1, 1.1, 1],
  ['香蕉', 'Banana, raw', 89, 1.1, 22.8, 0.3, 2.6, 1],
  ['苹果', 'Apple, raw', 52, 0.3, 13.8, 0.2, 2.4, 1],
  ['牛奶', 'Milk, whole', 61, 3.2, 4.8, 3.3, 0, 43],
  ['酸奶', 'Yogurt, plain', 61, 3.5, 4.7, 3.3, 0, 46],
  ['花生', 'Peanut, raw', 567, 25.8, 16.1, 49.2, 8.5, 18],
  ['杏仁', 'Almond, raw', 579, 21.2, 21.6, 49.9, 12.5, 1],
  ['橄榄油', 'Olive oil', 884, 0, 0, 100, 0, 2],
  ['食用油', 'Vegetable oil', 884, 0, 0, 100, 0, 0],
  ['盐', 'Salt, table', 0, 0, 0, 0, 0, 38758],
  ['酱油', 'Soy sauce', 53, 8.1, 4.9, 0.6, 0.8, 5493],
].map((item, index) => ({
  id: `common-${index}`,
  alias: item[0],
  name: item[1],
  nutrients: { energyKcal: item[2], proteinG: item[3], carbohydrateG: item[4], fatG: item[5], fiberG: item[6], sodiumMg: item[7] },
}))

function parseIngredientGrams(amount, unit) {
  const value = Number.parseFloat(String(amount || '').replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return undefined
  const normalized = String(unit || '').trim().toLowerCase()
  if (['g', '克', '公克'].includes(normalized)) return value
  if (['kg', '千克', '公斤'].includes(normalized)) return value * 1000
  return undefined
}

function matchCommonFood(name) {
  const value = String(name || '').trim().toLowerCase()
  if (!value) return undefined
  return COMMON_FOODS.find((food) => value.includes(food.alias.toLowerCase()) || food.alias.toLowerCase().includes(value))
}

function suggestIngredientNutrition(ingredient) {
  if (ingredient.food && ingredient.food.nutrients) return ingredient
  const food = matchCommonFood(ingredient.name)
  const grams = Number(ingredient.grams) || parseIngredientGrams(ingredient.amount, ingredient.unit)
  return { ...ingredient, grams: grams || '', food, foodId: food && food.id, foodName: food && food.name, nutritionMatch: food ? 'suggested' : 'unmatched' }
}

function calculateRecipeNutrition(ingredients) {
  const totals = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 }
  let calculatedCount = 0
  let ingredientCount = 0
  ;(ingredients || []).forEach((ingredient) => {
    if (!String(ingredient.name || '').trim()) return
    ingredientCount += 1
    const food = ingredient.food && ingredient.food.nutrients ? ingredient.food : matchCommonFood(ingredient.name)
    const grams = Number(ingredient.grams) || parseIngredientGrams(ingredient.amount, ingredient.unit)
    if (!food || !grams) return
    calculatedCount += 1
    NUTRIENTS.forEach(({ key }) => { totals[key] += Number(food.nutrients[key] || 0) * grams / 100 })
  })
  return { totals, calculatedCount, ingredientCount, complete: ingredientCount > 0 && ingredientCount === calculatedCount }
}

function nutrientChips(recipe, settings) {
  const result = calculateRecipeNutrition(recipe.ingredients)
  return (settings.nutrition.visibleNutrients || []).map((key) => {
    const meta = NUTRIENTS.find((item) => item.key === key)
    if (!meta) return undefined
    return { key, label: meta.label, value: `${result.totals[key].toFixed(meta.digits)} ${meta.unit}` }
  }).filter(Boolean)
}

function formatFoodLabel(food, query) {
  if (!food) return '未匹配'
  const chinese = String(query || '').trim().slice(0, 16) || food.alias || '标准食材'
  const english = food.name.length > 62 ? `${food.name.slice(0, 59)}…` : food.name
  return `${chinese} ｜ ${english}`
}

module.exports = { COMMON_FOODS, parseIngredientGrams, matchCommonFood, suggestIngredientNutrition, calculateRecipeNutrition, nutrientChips, formatFoodLabel }
