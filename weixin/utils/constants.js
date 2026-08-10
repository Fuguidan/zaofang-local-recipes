const MEALS = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
]
const FLAVORS = ['清淡', '辛辣', '酸甜', '咸鲜', '麻辣', '鲜香']
const DIET_TYPES = ['荤菜', '素菜', '主食', '汤羹']
const DIFFICULTIES = ['简单', '适中', '进阶']
const NUTRIENTS = [
  { key: 'energyKcal', label: '热量', unit: 'kcal', digits: 0 },
  { key: 'proteinG', label: '蛋白质', unit: 'g', digits: 1 },
  { key: 'carbohydrateG', label: '碳水', unit: 'g', digits: 1 },
  { key: 'fatG', label: '脂肪', unit: 'g', digits: 1 },
  { key: 'fiberG', label: '膳食纤维', unit: 'g', digits: 1 },
  { key: 'sodiumMg', label: '钠', unit: 'mg', digits: 0 },
]
const DEFAULT_SETTINGS = {
  debugMode: false,
  ai: { endpoint: '', model: '', apiKey: '', enabled: false, thinkingEnabled: false },
  nutrition: {
    visibleNutrients: ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'],
    estimatePeople: 2,
  },
}

module.exports = { MEALS, FLAVORS, DIET_TYPES, DIFFICULTIES, NUTRIENTS, DEFAULT_SETTINGS }
