import type { Recipe } from "./types";

export function normalizeRecipeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

export function findDuplicateRecipeByName(recipes: Recipe[], name: string, excludeId?: string) {
  const normalized = normalizeRecipeName(name);
  if (!normalized) return undefined;
  return recipes.find((recipe) => recipe.id !== excludeId && normalizeRecipeName(recipe.name) === normalized);
}
