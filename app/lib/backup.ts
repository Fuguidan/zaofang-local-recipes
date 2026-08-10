import { strFromU8, strToU8, Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import type { AppSettings, BackupManifest, NutrientKey, Recipe, RecommendationHistory } from "./types";
import { AppError } from "./errors.ts";

interface BackupPayload {
  recipes: Array<Omit<Recipe, "image"> & { imagePath?: string }>;
  settings: Pick<AppSettings, "debugMode" | "nutrition">;
  history: RecommendationHistory[];
}

export const BACKUP_STREAM_CHUNK_BYTES = 256 * 1024;

export interface BackupStreamSummary {
  zipBytes: number;
  imageBytes: number;
  imageCount: number;
}

type BackupChunkSink = (chunk: Uint8Array) => void | Promise<void>;

function prepareBackup(
  recipes: Recipe[],
  settings: AppSettings,
  history: RecommendationHistory[],
) {
  const imageFiles: string[] = [];
  const payload: BackupPayload = {
    recipes: recipes.map(({ image, ...recipe }) => {
      if (!image) return recipe;
      const extension = image.type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
      const imagePath = `images/${recipe.id}.${extension}`;
      imageFiles.push(imagePath);
      return { ...recipe, imagePath };
    }),
    settings: { debugMode: settings.debugMode, nutrition: settings.nutrition },
    history,
  };
  const manifest: BackupManifest = {
    format: "zaofan-backup",
    version: 1,
    appVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    recipeCount: recipes.length,
    imageFiles,
  };
  return { manifest, payload };
}

/**
 * Produces a ZIP incrementally. Images are read from Blob streams and are not
 * copied into one large in-memory file table before ZIP generation.
 */
export async function streamBackup(
  recipes: Recipe[],
  settings: AppSettings,
  history: RecommendationHistory[],
  sink: BackupChunkSink,
): Promise<BackupStreamSummary> {
  const { manifest, payload } = prepareBackup(recipes, settings, history);
  let sinkChain = Promise.resolve();
  let zipError: Error | undefined;
  let zipBytes = 0;
  let finalSeen = false;
  const enqueue = (data: Uint8Array) => {
    for (let offset = 0; offset < data.byteLength; offset += BACKUP_STREAM_CHUNK_BYTES) {
      const copy = data.slice(offset, Math.min(offset + BACKUP_STREAM_CHUNK_BYTES, data.byteLength));
      zipBytes += copy.byteLength;
      sinkChain = sinkChain.then(() => sink(copy));
    }
  };
  const zip = new Zip((error, data, final) => {
    if (error) zipError = error;
    else if (data?.byteLength) enqueue(data);
    if (final) finalSeen = true;
  });

  const flush = async () => {
    await sinkChain;
    if (zipError) throw zipError;
  };
  const addText = async (name: string, value: unknown) => {
    const entry = new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    entry.push(strToU8(JSON.stringify(value, null, 2)), true);
    await flush();
  };
  const addBlob = async (name: string, blob: Blob) => {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    const reader = blob.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let offset = 0; offset < value.byteLength; offset += BACKUP_STREAM_CHUNK_BYTES) {
          entry.push(value.subarray(offset, Math.min(offset + BACKUP_STREAM_CHUNK_BYTES, value.byteLength)));
          await flush();
        }
      }
      entry.push(new Uint8Array(0), true);
      await flush();
    } finally {
      reader.releaseLock();
    }
  };

  try {
    await addText("manifest.json", manifest);
    await addText("data.json", payload);
    let imageBytes = 0;
    let imageCount = 0;
    for (const recipe of recipes) {
      if (!recipe.image) continue;
      const imagePath = payload.recipes.find((item) => item.id === recipe.id)?.imagePath;
      if (!imagePath) continue;
      imageBytes += recipe.image.size;
      imageCount += 1;
      await addBlob(imagePath, recipe.image);
    }
    zip.end();
    await flush();
    if (!finalSeen) throw new Error("backup_zip_not_finalized");
    return { zipBytes, imageBytes, imageCount };
  } catch (error) {
    zip.terminate();
    throw new AppError("BACKUP", error instanceof Error ? error.message : String(error), error);
  }
}

export function createBackup(
  recipes: Recipe[],
  settings: AppSettings,
  history: RecommendationHistory[],
) {
  const chunks: ArrayBuffer[] = [];
  return streamBackup(recipes, settings, history, (chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    chunks.push(copy.buffer);
  }).then(() => new Blob(chunks, { type: "application/zip" }));
}

export async function parseBackup(file: File) {
  try {
    const archive = await streamUnzip(file);
    if (!archive.has("manifest.json") || !archive.has("data.json")) throw new Error("备份文件无法处理：缺少备份清单或数据");
    const manifest = JSON.parse(strFromU8(new Uint8Array(await archive.get("manifest.json")!.arrayBuffer()))) as BackupManifest;
    if (manifest.format !== "zaofan-backup" || manifest.version !== 1) throw new Error("备份版本不兼容");
    const payload = JSON.parse(strFromU8(new Uint8Array(await archive.get("data.json")!.arrayBuffer()))) as BackupPayload;
    if (!Array.isArray(payload.recipes) || manifest.recipeCount !== payload.recipes.length) {
      throw new Error("菜谱数量与清单不一致");
    }
    const recipes: Recipe[] = payload.recipes.map(({ imagePath, ...recipe }) => {
      if (!imagePath) return recipe as Recipe;
      const image = archive.get(imagePath);
      if (!image) throw new Error(`缺少图片 ${imagePath}`);
      const extension = imagePath.split(".").pop();
      const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
      return { ...recipe, image: image.slice(0, image.size, mime) } as Recipe;
    });
    const allowedNutrients = new Set<NutrientKey>(["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG", "sodiumMg"]);
    const visibleNutrients = Array.isArray(payload.settings?.nutrition?.visibleNutrients)
      ? payload.settings.nutrition.visibleNutrients.filter((key): key is NutrientKey => allowedNutrients.has(key as NutrientKey))
      : ["energyKcal", "proteinG", "carbohydrateG", "fatG"] satisfies NutrientKey[];
    const estimatePeople = Number.isFinite(payload.settings?.nutrition?.estimatePeople) && Number(payload.settings.nutrition.estimatePeople) >= 1
      ? Math.min(20, Math.round(Number(payload.settings.nutrition.estimatePeople)))
      : 2;
    return {
      manifest,
      recipes,
      settings: { debugMode: Boolean(payload.settings?.debugMode), nutrition: { visibleNutrients, estimatePeople } },
      history: payload.history || [],
    };
  } catch (error) {
    throw new AppError("BACKUP", error instanceof Error ? error.message : String(error), error);
  }
}

async function streamUnzip(file: Blob): Promise<Map<string, Blob>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Blob>();
    let activeEntries = 0;
    let inputFinished = false;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const maybeResolve = () => {
      if (!settled && inputFinished && activeEntries === 0) {
        settled = true;
        resolve(entries);
      }
    };
    const unzip = new Unzip((entry) => {
      activeEntries += 1;
      const parts: ArrayBuffer[] = [];
      entry.ondata = (error, data, final) => {
        if (error) return fail(error);
        if (data?.byteLength) {
          const copy = new Uint8Array(data.byteLength);
          copy.set(data);
          parts.push(copy.buffer);
        }
        if (final) {
          entries.set(entry.name, new Blob(parts));
          activeEntries -= 1;
          maybeResolve();
        }
      };
      entry.start();
    });
    unzip.register(UnzipInflate);

    void (async () => {
      const reader = file.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let offset = 0; offset < value.byteLength; offset += BACKUP_STREAM_CHUNK_BYTES) {
            unzip.push(value.subarray(offset, Math.min(offset + BACKUP_STREAM_CHUNK_BYTES, value.byteLength)));
          }
        }
        inputFinished = true;
        unzip.push(new Uint8Array(0), true);
        maybeResolve();
        queueMicrotask(() => {
          if (!settled && activeEntries > 0) fail(new Error("备份文件无法处理：ZIP 数据不完整"));
        });
      } catch (error) {
        fail(error);
      } finally {
        reader.releaseLock();
      }
    })();
  });
}
