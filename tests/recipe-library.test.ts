import assert from "node:assert/strict";
import test from "node:test";
import { getPaginationModel, paginateItems } from "../app/lib/recipe-library.ts";

test("paginates recipe items by ten and clamps invalid pages", () => {
  const recipes = Array.from({ length: 24 }, (_, index) => `菜谱${index + 1}`);
  assert.deepEqual(paginateItems(recipes, 1, 10), recipes.slice(0, 10));
  assert.deepEqual(paginateItems(recipes, 3, 10), recipes.slice(20));
  assert.deepEqual(paginateItems(recipes, 99, 10), recipes.slice(20));
});

test("builds compact pagination with first and last page", () => {
  assert.deepEqual(getPaginationModel(95, 10, 5), {
    currentPage: 5,
    totalPages: 10,
    pages: [1, 4, 5, 6, 10],
    rangeStart: 41,
    rangeEnd: 50,
  });
  assert.deepEqual(getPaginationModel(0, 10, 8), {
    currentPage: 1,
    totalPages: 1,
    pages: [1],
    rangeStart: 0,
    rangeEnd: 0,
  });
});
