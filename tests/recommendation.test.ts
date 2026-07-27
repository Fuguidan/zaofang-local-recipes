import assert from "node:assert/strict";
import test from "node:test";
import { recommendRecipes } from "../app/lib/recommendation.ts";
import type { Recipe } from "../app/lib/types.ts";

function recipe(id: string, meals: Recipe["meals"], flavor: Recipe["flavors"][number], dietType: Recipe["dietType"] = "素菜"): Recipe {
  return {
    id,
    name: id,
    description: "",
    ingredients: [],
    steps: ["完成"],
    meals,
    flavors: [flavor],
    tags: [],
    dietType,
    duration: 10,
    difficulty: "简单",
    incomplete: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const recipes = [
  recipe("a", ["dinner"], "清淡"),
  recipe("b", ["dinner"], "辛辣", "荤菜"),
  recipe("c", ["dinner"], "咸鲜"),
  recipe("d", ["dinner"], "清淡", "汤羹"),
  recipe("e", ["dinner"], "鲜香"),
  recipe("breakfast", ["breakfast"], "清淡", "主食"),
];

test("recommends people plus one dishes", () => {
  assert.equal(recommendRecipes(recipes, { people: 1, meal: "dinner", flavors: [], tags: [] }, [], [], 0.1).recipes.length, 2);
  assert.equal(recommendRecipes(recipes, { people: 2, meal: "dinner", flavors: [], tags: [] }, [], [], 0.1).recipes.length, 3);
  assert.equal(recommendRecipes(recipes, { people: 4, meal: "dinner", flavors: [], tags: [] }, [], [], 0.1).recipes.length, 5);
});

test("filters meal and reports shortages", () => {
  const result = recommendRecipes(recipes, { people: 2, meal: "breakfast", flavors: [], tags: [] }, [], [], 0.1);
  assert.deepEqual(result.recipes.map((item) => item.id), ["breakfast"]);
  assert.equal(result.shortage, 2);
});

test("keeps fixed dishes without duplicates", () => {
  const result = recommendRecipes(recipes, { people: 2, meal: "dinner", flavors: [], tags: [] }, [], ["b"], 0.1);
  assert.equal(result.recipes[0].id, "b");
  assert.equal(new Set(result.recipes.map((item) => item.id)).size, result.recipes.length);
});

test("rejects invalid people count", () => {
  assert.throws(() => recommendRecipes(recipes, { people: 0, meal: "dinner", flavors: [], tags: [] }));
});
