import nutritionData from "../data/nutrition-foods.json" with { type: "json" };
import type { Ingredient, NutrientKey, NutrientValues } from "./types";

export interface FoodReference {
  id: string;
  name: string;
  source: string;
  sourceRecordId: string;
  nutrients: NutrientValues;
}

export const NUTRIENT_KEYS: NutrientKey[] = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG", "sodiumMg"];
export const DEFAULT_VISIBLE_NUTRIENTS: NutrientKey[] = ["energyKcal", "proteinG", "carbohydrateG", "fatG"];
export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: string; digits: number }> = {
  energyKcal: { label: "热量", unit: "kcal", digits: 0 },
  proteinG: { label: "蛋白质", unit: "g", digits: 1 },
  carbohydrateG: { label: "碳水", unit: "g", digits: 1 },
  fatG: { label: "脂肪", unit: "g", digits: 1 },
  fiberG: { label: "膳食纤维", unit: "g", digits: 1 },
  sodiumMg: { label: "钠", unit: "mg", digits: 0 },
};

const foods = nutritionData.foods as FoodReference[];
const foodById = new Map(foods.map((food) => [food.id, food]));

const CHINESE_SEARCH_TERMS: Record<string, string[]> = {
  "鸡蛋": ["egg whole", "eggs grade a large egg whole"], "蛋白": ["egg white"], "蛋黄": ["egg yolk"],
  "鸡胸肉": ["chicken breast skinless"], "鸡胸": ["chicken breast skinless"], "鸡腿": ["chicken drumstick"], "鸡翅": ["chicken wing"], "鸡肉": ["chicken meat"],
  "牛肉": ["beef raw lean"], "猪肉": ["pork raw lean"], "羊肉": ["lamb raw"], "培根": ["bacon cooked"],
  "三文鱼": ["salmon raw"], "金枪鱼": ["tuna raw", "tuna canned water"], "虾": ["shrimp cooked"], "鳕鱼": ["cod raw"],
  "豆腐": ["tofu raw firm"], "豆浆": ["soymilk"], "黄豆": ["soybeans mature seeds"], "黑豆": ["beans black mature seeds"],
  "米饭": ["rice white cooked"], "大米": ["rice white long-grain raw"], "糙米": ["rice brown cooked"], "燕麦": ["oats"],
  "面条": ["noodles cooked"], "面粉": ["flour wheat all-purpose"], "小米": ["millet cooked"], "玉米": ["corn sweet yellow"],
  "红薯": ["sweet potato cooked"], "地瓜": ["sweet potato cooked"], "土豆": ["potatoes flesh and skin raw"],
  "番茄": ["tomatoes red ripe raw"], "西红柿": ["tomatoes red ripe raw"], "黄瓜": ["cucumber with peel raw"],
  "胡萝卜": ["carrots raw"], "西兰花": ["broccoli raw"], "菠菜": ["spinach raw"], "生菜": ["lettuce raw"],
  "白菜": ["cabbage napa raw"], "卷心菜": ["cabbage green raw"], "芹菜": ["celery raw"], "茄子": ["eggplant raw"],
  "洋葱": ["onions raw"], "大蒜": ["garlic raw"], "蒜": ["garlic raw"], "姜": ["ginger root raw"], "青椒": ["peppers sweet green raw"],
  "蘑菇": ["mushrooms white raw"], "香菇": ["mushrooms shiitake"], "南瓜": ["pumpkin raw"], "豌豆": ["peas green"],
  "香蕉": ["bananas raw"], "苹果": ["apples raw with skin"], "橙子": ["oranges raw"], "蓝莓": ["blueberries raw"],
  "牛奶": ["milk whole"], "酸奶": ["yogurt plain"], "奶酪": ["cheese cheddar"],
  "花生": ["peanuts raw"], "杏仁": ["almonds raw"], "核桃": ["walnuts english raw"],
  "橄榄油": ["oil olive"], "食用油": ["oil vegetable"], "菜籽油": ["oil canola"], "黄油": ["butter"],
  "盐": ["salt table"], "白糖": ["sugars granulated"], "糖": ["sugars granulated"], "酱油": ["soy sauce"],
};

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/[，、]/g, " ").replace(/\s+/g, " ");
}

function expandedTerms(query: string) {
  const normalized = normalizeSearch(query);
  const translated = Object.entries(CHINESE_SEARCH_TERMS)
    .filter(([alias]) => normalized.includes(alias))
    .flatMap(([, terms]) => terms);
  return translated.length ? translated : [normalized];
}

export function searchFoods(query: string, limit = 12) {
  const terms = expandedTerms(query).filter(Boolean);
  if (!terms.length) return [];
  return foods
    .map((food) => {
      const name = food.name.toLowerCase();
      let score = 0;
      for (const term of terms) {
        const words = term.split(" ").filter(Boolean);
        if (name === term) score = Math.max(score, 120);
        else if (name.startsWith(term)) score = Math.max(score, 100);
        else if (name.includes(term)) score = Math.max(score, 80);
        else if (words.every((word) => name.includes(word))) score = Math.max(score, 60);
      }
      if (food.source.startsWith("usda-foundation")) score += 3;
      return { food, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length)
    .slice(0, limit)
    .map((item) => item.food);
}

export function getFoodReference(id?: string) {
  return id ? foodById.get(id) : undefined;
}

function chineseAliasForFood(food: FoodReference) {
  const name = food.name.toLowerCase();
  for (const [alias, terms] of Object.entries(CHINESE_SEARCH_TERMS)) {
    if (terms.some((term) => term.split(" ").filter(Boolean).every((word) => name.includes(word)))) return alias;
  }
  return "";
}

export function formatFoodDisplayLabel(food: FoodReference | undefined, query = "") {
  if (!food) return "未匹配";
  const queryAlias = Object.keys(CHINESE_SEARCH_TERMS)
    .sort((a, b) => b.length - a.length)
    .find((alias) => query.includes(alias));
  const chinese = queryAlias || chineseAliasForFood(food) || (/[\u3400-\u9fff]/.test(query) ? query.trim().slice(0, 16) : "标准食材");
  const english = food.name.length > 72 ? `${food.name.slice(0, 69)}…` : food.name;
  return `${chinese} ｜ ${english}`;
}

export function parseIngredientGrams(amount: string, unit: string) {
  const number = Number.parseFloat(amount.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return undefined;
  const normalizedUnit = unit.trim().toLowerCase();
  if (["g", "克", "公克"].includes(normalizedUnit)) return number;
  if (["kg", "千克", "公斤"].includes(normalizedUnit)) return number * 1000;
  return undefined;
}

export function suggestIngredientNutrition(ingredient: Ingredient): Ingredient {
  if (ingredient.foodId && getFoodReference(ingredient.foodId)) return ingredient;
  const food = searchFoods(ingredient.name, 1)[0];
  const grams = ingredient.grams || parseIngredientGrams(ingredient.amount, ingredient.unit);
  if (!food) return { ...ingredient, grams, nutritionMatch: "unmatched" };
  return { ...ingredient, grams, foodId: food.id, foodName: food.name, nutritionMatch: "suggested" };
}

export function calculateRecipeNutrition(ingredients: Ingredient[]) {
  const totals: NutrientValues = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 };
  const breakdown = ingredients.map((ingredient) => {
    const food = getFoodReference(ingredient.foodId);
    const grams = ingredient.grams || parseIngredientGrams(ingredient.amount, ingredient.unit);
    if (!food || !grams || grams <= 0) return { ingredient, food, grams, nutrients: undefined };
    const nutrients = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, food.nutrients[key] * grams / 100])) as unknown as NutrientValues;
    for (const key of NUTRIENT_KEYS) totals[key] += nutrients[key];
    return { ingredient, food, grams, nutrients };
  });
  const calculatedCount = breakdown.filter((item) => item.nutrients).length;
  return {
    totals,
    breakdown,
    calculatedCount,
    ingredientCount: ingredients.filter((item) => item.name.trim()).length,
    complete: calculatedCount > 0 && calculatedCount === ingredients.filter((item) => item.name.trim()).length,
    proteinDensity: totals.energyKcal > 0 ? totals.proteinG / totals.energyKcal * 100 : 0,
  };
}

export function formatNutrientValue(key: NutrientKey, value: number) {
  const meta = NUTRIENT_META[key];
  return `${value.toFixed(meta.digits)} ${meta.unit}`;
}

export const LOCAL_NUTRITION_DATA_INFO = {
  version: nutritionData.version,
  count: nutritionData.count,
};
