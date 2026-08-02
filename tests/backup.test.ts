import assert from "node:assert/strict";
import test from "node:test";
import { createBackup, parseBackup } from "../app/lib/backup.ts";
import { isAndroidNativeBackupAvailable, openAndroidSavedBackup, saveBackupWithAndroid } from "../app/lib/native-backup.ts";
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

test("exports and imports original HEIC images", async () => {
  const heicRecipe: Recipe = {
    ...sample,
    id: "recipe-heic",
    image: new File(["heic-bytes"], "测试.HEIC", { type: "image/heic" }),
    imageName: "测试.HEIC",
  };
  const blob = await createBackup([heicRecipe], settings, []);
  const parsed = await parseBackup(new File([blob], "backup.zip", { type: "application/zip" }));
  assert.equal(parsed.manifest.imageFiles[0], "images/recipe-heic.heic");
  assert.equal(parsed.recipes[0].image?.type, "image/heic");
  assert.equal(await parsed.recipes[0].image?.text(), "heic-bytes");
});

test("detects Android native backup availability by platform", () => {
  assert.equal(isAndroidNativeBackupAvailable("android"), true);
  assert.equal(isAndroidNativeBackupAvailable("web"), false);
  assert.equal(isAndroidNativeBackupAvailable("ios"), false);
});

test("passes backup zip bytes to Android native document saver", async () => {
  const calls: Array<{ data: string; filename: string; mimeType: string }> = [];
  const result = await saveBackupWithAndroid(new Blob(["zip-bytes"], { type: "application/zip" }), "备份.zip", {
    saveZip: async (options) => {
      calls.push(options);
      return { uri: "content://backup/1", filename: options.filename, mimeType: options.mimeType, displayPath: "content://backup/1" };
    },
  });
  assert.equal(calls[0].filename, "备份.zip");
  assert.equal(calls[0].mimeType, "application/zip");
  assert.equal(Buffer.from(calls[0].data, "base64").toString("utf8"), "zip-bytes");
  assert.equal(result.uri, "content://backup/1");
});

test("opens Android saved backup through native plugin", async () => {
  const calls: Array<{ uri: string; mimeType: string }> = [];
  await openAndroidSavedBackup("content://backup/1", {
    openSavedFile: async (options) => {
      calls.push(options);
    },
  });
  assert.deepEqual(calls[0], { uri: "content://backup/1", mimeType: "application/zip" });
});
