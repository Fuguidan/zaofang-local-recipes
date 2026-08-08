import assert from "node:assert/strict";
import test from "node:test";
import { calculateRecipeNutrition, LOCAL_NUTRITION_DATA_INFO, parseIngredientGrams, searchFoods, suggestIngredientNutrition } from "../app/lib/nutrition.ts";
import type { Ingredient } from "../app/lib/types.ts";

test("bundles a comprehensive local nutrition database", () => {
  assert.ok(LOCAL_NUTRITION_DATA_INFO.count >= 7000);
  assert.match(LOCAL_NUTRITION_DATA_INFO.version, /usda-fdc/);
});

test("searches common Chinese ingredient aliases offline", () => {
  assert.match(searchFoods("鸡蛋", 1)[0]?.name || "", /egg/i);
  assert.match(searchFoods("鸡胸肉", 1)[0]?.name || "", /chicken.*breast/i);
  assert.match(searchFoods("西红柿", 1)[0]?.name || "", /tomato/i);
});

test("converts supported ingredient units to grams", () => {
  assert.equal(parseIngredientGrams("200", "克"), 200);
  assert.equal(parseIngredientGrams("0.5", "kg"), 500);
  assert.equal(parseIngredientGrams("2", "个"), undefined);
});

test("calculates ingredient contributions and whole recipe totals", () => {
  const base: Ingredient = { id: "1", name: "鸡蛋", amount: "100", unit: "克" };
  const egg = suggestIngredientNutrition(base);
  const doubled = { ...egg, id: "2" };
  const result = calculateRecipeNutrition([egg, doubled]);
  assert.equal(result.complete, true);
  assert.equal(result.calculatedCount, 2);
  assert.ok(result.totals.energyKcal > 0);
  assert.equal(result.totals.energyKcal, result.breakdown[0].nutrients!.energyKcal * 2);
  assert.ok(result.proteinDensity > 0);
});

test("marks totals incomplete when an ingredient lacks grams or a food match", () => {
  const matched = suggestIngredientNutrition({ id: "1", name: "鸡蛋", amount: "100", unit: "克" });
  const result = calculateRecipeNutrition([matched, { id: "2", name: "神秘调料", amount: "少许", unit: "" }]);
  assert.equal(result.complete, false);
  assert.equal(result.calculatedCount, 1);
  assert.equal(result.ingredientCount, 2);
});
