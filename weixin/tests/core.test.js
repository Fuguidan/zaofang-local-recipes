const assert = require('node:assert/strict')
const test = require('node:test')

const { normalizeRecipeName, findDuplicateRecipeByName, paginate, sanitizeDraft } = require('../utils/recipe')
const { recommendRecipes } = require('../utils/recommendation')
const { suggestIngredientNutrition, calculateRecipeNutrition, formatFoodLabel } = require('../utils/nutrition')
const { parseTokenUsageLog, buildTokenAnalytics } = require('../utils/token')
const { normalizeEndpoint, normalizeConfig, extractContent, usageOf } = require('../utils/ai')

test('normalizes Chinese recipe names and detects duplicates while excluding current record', () => {
  const recipes = [{ id: '1', name: ' 番茄  炒蛋 ' }, { id: '2', name: '红烧肉' }]
  assert.equal(normalizeRecipeName('番茄　炒蛋'), '番茄 炒蛋')
  assert.equal(findDuplicateRecipeByName(recipes, '番茄 炒蛋').id, '1')
  assert.equal(findDuplicateRecipeByName(recipes, '番茄 炒蛋', '1'), undefined)
})

test('sanitizes drafts and allows incomplete recipes to remain local drafts', () => {
  const value = sanitizeDraft({ name: '', ingredients: [{ name: '', amount: '', unit: '' }], steps: [''], tagsText: '健身餐， 高蛋白', duration: '20' })
  assert.equal(value.incomplete, true)
  assert.deepEqual(value.tags, ['健身餐', '高蛋白'])
  assert.equal(value.duration, 20)
})

test('paginates recipe lists by ten and clamps invalid pages', () => {
  const items = Array.from({ length: 23 }, (_, index) => index)
  assert.deepEqual(paginate(items, 2, 10).items, items.slice(10, 20))
  assert.equal(paginate(items, 99, 10).page, 3)
})

test('recommends people plus one dishes and keeps fixed dishes', () => {
  const recipes = Array.from({ length: 6 }, (_, index) => ({ id: String(index), meals: ['dinner'], flavors: index % 2 ? ['清淡'] : ['辛辣'], tags: [], incomplete: false }))
  const result = recommendRecipes(recipes, { people: 2, meal: 'dinner', flavors: ['清淡'], tags: [] }, [], ['0'], 0.3)
  assert.equal(result.targetCount, 3)
  assert.equal(result.recipes.length, 3)
  assert.equal(result.recipes[0].id, '0')
  assert.equal(new Set(result.recipes.map((item) => item.id)).size, 3)
})

test('matches common Chinese foods and calculates six local nutrients', () => {
  const chicken = suggestIngredientNutrition({ name: '鸡胸肉', amount: '200', unit: '克' })
  const rice = suggestIngredientNutrition({ name: '米饭', grams: 150, amount: '', unit: '' })
  const result = calculateRecipeNutrition([chicken, rice])
  assert.equal(chicken.food.name, 'Chicken breast, skinless, cooked')
  assert.match(formatFoodLabel(chicken.food, '鸡胸肉'), /鸡胸肉 ｜ Chicken/)
  assert.equal(result.complete, true)
  assert.ok(result.totals.energyKcal > 500)
  assert.ok(result.totals.proteinG > 60)
})

test('parses reasoning token logs and aggregates by dish and period', () => {
  const entry = { event: 'recipe_token_usage', timestamp: new Date().toISOString(), message: '菜名=红烧肉；输入=100 token；输出=80 token；思考=30 token；回答=50 token；总计=180 token' }
  assert.equal(parseTokenUsageLog(entry).reasoningTokens, 30)
  const analytics = buildTokenAnalytics([entry], 'month', new Date())
  assert.equal(analytics.totalTokens, 180)
  assert.equal(analytics.dishes[0].name, '红烧肉')
  assert.equal(analytics.answerTokens, 50)
})

test('normalizes copied provider endpoints and compatible model names', () => {
  assert.equal(normalizeEndpoint(' https://dashscope.aliyuncs.com/compatible-mode/v1/ '), 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  assert.equal(normalizeConfig({ endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-flash', apiKey: ' key ', enabled: true }).model, 'qwen3.6-flash')
})

test('extracts OpenAI-compatible and Responses API model content', () => {
  assert.equal(extractContent({ choices: [{ message: { content: '菜谱 JSON' } }] }), '菜谱 JSON')
  assert.equal(extractContent({ output_text: 'response text' }), 'response text')
  assert.equal(extractContent({ choices: [{ message: { content: [{ type: 'text', text: 'block text' }] } }] }), 'block text')
})

test('separates model reasoning tokens from answer tokens', () => {
  const usage = usageOf({ usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180, completion_tokens_details: { reasoning_tokens: 30 } } })
  assert.deepEqual(usage, { inputTokens: 100, outputTokens: 80, reasoningTokens: 30, answerTokens: 50, totalTokens: 180, available: true })
})
