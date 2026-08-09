import assert from "node:assert/strict";
import test from "node:test";
import { findDuplicateRecipeByName, normalizeRecipeName } from "../app/lib/recipe-name.ts";
import type { Recipe } from "../app/lib/types.ts";

function recipe(id: string, name: string): Recipe {
  const now = "2026-08-09T00:00:00.000Z";
  return {
    id, name, description: "", ingredients: [], steps: [], meals: [], flavors: [], tags: [],
    dietType: "素菜", duration: 10, difficulty: "简单", incomplete: false, createdAt: now, updatedAt: now,
  };
}

test("normalizes recipe names before duplicate comparison", () => {
  assert.equal(normalizeRecipeName("  番茄   炒蛋  "), normalizeRecipeName("番茄 炒蛋"));
  assert.equal(normalizeRecipeName("Mapo TOFU"), normalizeRecipeName("ｍａｐｏ tofu"));
});

test("finds an existing recipe with the same normalized name", () => {
  const recipes = [recipe("1", "番茄炒蛋"), recipe("2", "红烧肉")];
  assert.equal(findDuplicateRecipeByName(recipes, " 番茄炒蛋 ")?.id, "1");
});

test("does not treat the recipe being edited as its own duplicate", () => {
  const recipes = [recipe("1", "番茄炒蛋"), recipe("2", "红烧肉")];
  assert.equal(findDuplicateRecipeByName(recipes, "番茄炒蛋", "1"), undefined);
  assert.equal(findDuplicateRecipeByName(recipes, "红烧肉", "1")?.id, "2");
});

test("does not deduplicate empty draft names", () => {
  assert.equal(findDuplicateRecipeByName([recipe("1", "待完善菜谱")], "   "), undefined);
});
