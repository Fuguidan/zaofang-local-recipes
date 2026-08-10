import assert from "node:assert/strict";
import test from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createBackup, parseBackup, streamBackup } from "../app/lib/backup.ts";
import {
  ANDROID_BACKUP_CHUNK_BYTES,
  isAndroidNativeBackupAvailable,
  openAndroidSavedBackup,
  saveBackupWithAndroid,
} from "../app/lib/native-backup.ts";
import type { AppSettings, Recipe } from "../app/lib/types.ts";

const settings: AppSettings = {
  debugMode: true,
  ai: { endpoint: "https://example.test", model: "vision", apiKey: "sk-super-secret", enabled: true, thinkingEnabled: false },
  nutrition: { visibleNutrients: ["energyKcal", "proteinG", "fiberG"], estimatePeople: 3 },
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
  assert.deepEqual(parsed.settings, { debugMode: true, nutrition: { visibleNutrients: ["energyKcal", "proteinG", "fiberG"], estimatePeople: 3 } });
});

test("rejects damaged zip files", async () => {
  const file = new File(["not-a-zip"], "broken.zip", { type: "application/zip" });
  await assert.rejects(() => parseBackup(file), /备份文件无法处理|invalid|Unknown compression method/i);
});

test("imports a backup through the file stream without reading the whole zip into an arrayBuffer", async () => {
  const blob = await createBackup([sample], settings, []);
  const file = new File([blob], "streamed-import.zip", { type: "application/zip" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => { throw new Error("whole zip arrayBuffer must not be used"); },
  });
  const parsed = await parseBackup(file);
  assert.equal(parsed.recipes[0].name, "测试菜");
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

test("streams backup zip to Android in bounded chunks", async () => {
  const source = new Uint8Array(ANDROID_BACKUP_CHUNK_BYTES * 2 + 17).fill(7);
  const chunks: Uint8Array[] = [];
  const result = await saveBackupWithAndroid(new Blob([source], { type: "application/zip" }), "备份.zip", {
    beginZip: async (options) => {
      assert.equal(options.filename, "备份.zip");
      assert.equal(options.mimeType, "application/zip");
      return { exportId: "export-1" };
    },
    appendZipChunk: async (options) => {
      assert.equal(options.exportId, "export-1");
      chunks.push(Buffer.from(options.data, "base64"));
      return { bytesWritten: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) };
    },
    finishZip: async (options) => {
      assert.equal(options.exportId, "export-1");
      assert.equal(options.expectedBytes, source.byteLength);
      return { uri: "content://backup/1", filename: "备份.zip", mimeType: "application/zip", displayPath: "content://backup/1" };
    },
    abortZip: async () => undefined,
  });
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.byteLength <= ANDROID_BACKUP_CHUNK_BYTES));
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(source));
  assert.equal(result.uri, "content://backup/1");
});

test("aborts Android temporary export when a chunk fails", async () => {
  const aborted: string[] = [];
  let chunks = 0;
  await assert.rejects(
    () => saveBackupWithAndroid(new Blob([new Uint8Array(ANDROID_BACKUP_CHUNK_BYTES + 1)]), "备份.zip", {
      beginZip: async () => ({ exportId: "export-failed" }),
      appendZipChunk: async () => {
        chunks += 1;
        if (chunks === 2) throw new Error("disk_full");
        return { bytesWritten: ANDROID_BACKUP_CHUNK_BYTES };
      },
      finishZip: async () => { throw new Error("must_not_finish"); },
      abortZip: async ({ exportId }) => { aborted.push(exportId); },
    }),
    /disk_full/,
  );
  assert.deepEqual(aborted, ["export-failed"]);
});

test("streams a large image into a valid backup without whole-image arrayBuffer", async () => {
  const largeImage = new Blob([new Uint8Array(20 * 1024 * 1024).fill(3)], { type: "image/png" });
  Object.defineProperty(largeImage, "arrayBuffer", {
    value: async () => { throw new Error("whole image arrayBuffer must not be used"); },
  });
  const recipe = { ...sample, image: largeImage };
  const output: ArrayBuffer[] = [];
  const summary = await streamBackup([recipe], settings, [], async (chunk) => {
    assert.ok(chunk.byteLength <= 512 * 1024);
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    output.push(copy.buffer);
  });
  assert.ok(output.length > 20);
  assert.equal(summary.imageBytes, largeImage.size);
  const parsed = await parseBackup(new File(output, "large-backup.zip", { type: "application/zip" }));
  assert.equal(parsed.recipes[0].image?.size, largeImage.size);
});

const localPhotoDirectory = fileURLToPath(new URL("../caipin_photo", import.meta.url));
test("streams the optional local 200MB photo sample with bounded memory chunks", { skip: !existsSync(localPhotoDirectory) }, async () => {
  const names = (await readdir(localPhotoDirectory)).filter((name) => /\.(?:png|jpe?g|heic|heif|webp)$/i.test(name));
  const recipes: Recipe[] = [];
  for (const [index, name] of names.entries()) {
    const extension = name.split(".").pop()?.toLowerCase();
    const type = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    const path = `${localPhotoDirectory}/${name}`;
    const size = (await stat(path)).size;
    const image = {
      size,
      type,
      stream: () => Readable.toWeb(createReadStream(path, { highWaterMark: ANDROID_BACKUP_CHUNK_BYTES })) as ReadableStream<Uint8Array>,
    } as unknown as Blob;
    recipes.push({ ...sample, id: `large-${index}`, name: `压力样本-${index}`, image, imageName: name });
  }
  const sourceBytes = recipes.reduce((sum, recipe) => sum + (recipe.image?.size || 0), 0);
  let streamedBytes = 0;
  const summary = await streamBackup(recipes, settings, [], (chunk) => {
    assert.ok(chunk.byteLength <= ANDROID_BACKUP_CHUNK_BYTES);
    streamedBytes += chunk.byteLength;
  });
  assert.ok(sourceBytes >= 200 * 1024 * 1024);
  assert.equal(summary.imageBytes, sourceBytes);
  assert.equal(summary.zipBytes, streamedBytes);
});

test("Android native backup plugin appends decoded chunks instead of receiving one full zip", async () => {
  const source = await readFile(new URL("../android/app/src/main/java/cn/zaofang/recipes/NativeBackupFilePlugin.java", import.meta.url), "utf8");
  assert.match(source, /void beginZip\(PluginCall call\)/);
  assert.match(source, /void appendZipChunk\(PluginCall call\)/);
  assert.match(source, /new FileOutputStream\([^,]+, true\)/);
  assert.match(source, /void finishZip\(PluginCall call\)/);
  assert.match(source, /void abortZip\(PluginCall call\)/);
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
