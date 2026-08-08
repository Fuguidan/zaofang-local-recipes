import { readFile, writeFile } from "node:fs/promises";

const [foundationPath, legacyPath, outputPath = "app/data/nutrition-foods.json"] = process.argv.slice(2);

if (!foundationPath || !legacyPath) {
  throw new Error("用法：node scripts/generate-nutrition-data.mjs <Foundation JSON> <SR Legacy JSON> [输出文件]");
}

const [foundation, legacy] = await Promise.all([
  readFile(foundationPath, "utf8").then(JSON.parse),
  readFile(legacyPath, "utf8").then(JSON.parse),
]);

const nutrientIds = {
  proteinG: [1003],
  fatG: [1004],
  carbohydrateG: [1005],
  fiberG: [1079],
  sodiumMg: [1093],
  energyKcal: [1008, 2047, 2048],
};

function nutrientAmount(food, ids) {
  for (const id of ids) {
    const item = (food.foodNutrients || []).find((entry) => entry?.nutrient?.id === id && Number.isFinite(entry.amount));
    if (item) return Number(item.amount);
  }
  return undefined;
}

function compact(food, source) {
  const nutrients = Object.fromEntries(
    Object.entries(nutrientIds).map(([key, ids]) => [key, nutrientAmount(food, ids)]),
  );
  if (Object.values(nutrients).some((value) => value === undefined)) return undefined;
  return {
    id: `fdc-${food.fdcId}`,
    name: food.description,
    source,
    sourceRecordId: String(food.fdcId),
    nutrients,
  };
}

const seenNames = new Set();
const foods = [];
for (const [items, source] of [
  [foundation.FoundationFoods || [], "usda-foundation-2026-04"],
  [legacy.SRLegacyFoods || [], "usda-sr-legacy-2018-04"],
]) {
  for (const food of items) {
    if (!food) continue;
    const record = compact(food, source);
    if (!record) continue;
    const normalizedName = record.name.trim().toLowerCase();
    if (seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);
    foods.push(record);
  }
}

foods.sort((a, b) => a.name.localeCompare(b.name, "en"));
const payload = {
  version: "usda-fdc-2026-04+sr-legacy-2018-04",
  generatedAt: "2026-08-09",
  count: foods.length,
  foods,
};

await writeFile(outputPath, JSON.stringify(payload));
console.log(`Generated ${foods.length} local nutrition records at ${outputPath}`);
