import assert from "node:assert/strict";
import test from "node:test";
import { createBackup, parseBackup } from "../app/lib/backup.ts";
import type { AppSettings, Recipe } from "../app/lib/types.ts";

const settings: AppSettings = {
  debugMode: true,
  ai: { endpoint: "https://example.test", model: "vision", apiKey: "sk-super-secret", enabled: true },
};

const sample: Recipe = {
  id: "recipe-1",
  name: "测试菜",
  description: "中文内容",
  ingredients: [{ id: "i1", name: "青菜", amount: "1", unit: "把" }],
  steps: ["洗净炒熟"],
  meals: ["dinner"],
  flavors: ["清淡"],
  tags: ["快手菜"],
  dietType: "素菜",
  duration: 10,
  difficulty: "简单",
  image: new Blob(["image-bytes"], { type: "image/png" }),
  imageName: "测试.png",
  incomplete: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("exports and imports recipes and images without secrets", async () => {
  const blob = await createBackup([sample], settings, []);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes).includes("sk-super-secret"), false);
  const file = new File([blob], "backup.zip", { type: "application/zip" });
  const parsed = await parseBackup(file);
  assert.equal(parsed.recipes[0].name, "测试菜");
  assert.equal(await parsed.recipes[0].image?.text(), "image-bytes");
  assert.deepEqual(parsed.settings, { debugMode: true });
});

test("rejects damaged zip files", async () => {
  const file = new File(["not-a-zip"], "broken.zip", { type: "application/zip" });
  await assert.rejects(() => parseBackup(file), /备份文件无法处理|invalid|Unknown compression method/i);
});
