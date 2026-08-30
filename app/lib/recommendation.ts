import type { Recipe, RecommendationHistory, RecommendationRequest, RecommendationResult } from "./types";

function scoreRecipe(recipe: Recipe, request: RecommendationRequest, recentIds: Set<string>) {
  let score = 0;
  if (recipe.meals.includes(request.meal)) score += 50;
  else return -1;
  score += request.flavors.filter((flavor) => recipe.flavors.includes(flavor)).length * 14;
  score += request.tags.filter((tag) => recipe.tags.includes(tag)).length * 10;
  if (!recentIds.has(recipe.id)) score += 8;
  if (!recipe.incomplete) score += 4;
  return score;
}

function seededTie(id: string, salt: number) {
  let value = (Math.floor(Math.abs(salt % 1) * 0xffffffff) ^ 0x9e3779b9) >>> 0;
  for (let index = 0; index < id.length; index += 1) {
    value = Math.imul(value ^ id.charCodeAt(index), 0x85ebca6b) >>> 0;
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value / 0x100000000;
}

export function singleReplacementPlan(currentIds: string[], userFixedIds: string[], replacedId: string) {
  return {
    selectionFixedIds: currentIds.filter((id) => id !== replacedId),
    persistentFixedIds: userFixedIds.filter((id) => id !== replacedId),
    avoidIds: [replacedId],
  };
}

export function recommendRecipes(
  recipes: Recipe[],
  request: RecommendationRequest,
  history: RecommendationHistory[] = [],
  fixedIds: string[] = [],
  salt = Math.random(),
  avoidIds: string[] = [],
): RecommendationResult {
  if (!Number.isInteger(request.people) || request.people < 1 || request.people > 20) {
    throw new Error("人数应为 1 到 20 的整数");
  }
  const targetCount = request.people + 1;
  const recentIds = new Set(
    [...history]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-5)
      .flatMap((item) => item.recipeIds),
  );
  const avoid = new Set(avoidIds.filter((id) => !fixedIds.includes(id)));
  const fixed = fixedIds.map((id) => recipes.find((recipe) => recipe.id === id)).filter(Boolean) as Recipe[];
  const ranked = recipes
    .filter((recipe) => !fixedIds.includes(recipe.id))
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, request, recentIds), avoided: avoid.has(recipe.id), tie: seededTie(recipe.id, salt) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => Number(a.avoided) - Number(b.avoided) || b.score - a.score || a.tie - b.tie)
    .map((item) => item.recipe);

  const selected = [...fixed, ...ranked].slice(0, targetCount);
  const shortage = Math.max(0, targetCount - selected.length);
  return {
    targetCount,
    recipes: selected,
    shortage,
    reason: shortage
      ? `符合条件的菜谱不足，还差 ${shortage} 道。可减少口味或标签限制。`
      : `已按${request.people}人、${request.meal === "breakfast" ? "早餐" : request.meal === "lunch" ? "午餐" : "晚餐"}和口味偏好推荐。`,
  };
}
