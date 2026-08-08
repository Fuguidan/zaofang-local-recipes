import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { AppSettings, BackupManifest, NutrientKey, Recipe, RecommendationHistory } from "./types";
import { AppError } from "./errors.ts";

interface BackupPayload {
  recipes: Array<Omit<Recipe, "image"> & { imagePath?: string }>;
  settings: Pick<AppSettings, "debugMode" | "nutrition">;
  history: RecommendationHistory[];
}

export function createBackup(
  recipes: Recipe[],
  settings: AppSettings,
  history: RecommendationHistory[],
) {
  const files: Record<string, Uint8Array> = {};
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
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["data.json"] = strToU8(JSON.stringify(payload, null, 2));
  return Promise.all(
    recipes.map(async (recipe) => {
      const path = payload.recipes.find((item) => item.id === recipe.id)?.imagePath;
      if (path && recipe.image) files[path] = new Uint8Array(await recipe.image.arrayBuffer());
    }),
  ).then(() => new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/zip" }));
}

export async function parseBackup(file: File) {
  try {
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
    if (!archive["manifest.json"] || !archive["data.json"]) throw new Error("缺少备份清单或数据");
    const manifest = JSON.parse(strFromU8(archive["manifest.json"])) as BackupManifest;
    if (manifest.format !== "zaofan-backup" || manifest.version !== 1) throw new Error("备份版本不兼容");
    const payload = JSON.parse(strFromU8(archive["data.json"])) as BackupPayload;
    if (!Array.isArray(payload.recipes) || manifest.recipeCount !== payload.recipes.length) {
      throw new Error("菜谱数量与清单不一致");
    }
    const recipes: Recipe[] = payload.recipes.map(({ imagePath, ...recipe }) => {
      if (!imagePath) return recipe as Recipe;
      const bytes = archive[imagePath];
      if (!bytes) throw new Error(`缺少图片 ${imagePath}`);
      const extension = imagePath.split(".").pop();
      const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
      return { ...recipe, image: new Blob([bytes as BlobPart], { type: mime }) } as Recipe;
    });
    const allowedNutrients = new Set<NutrientKey>(["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG", "sodiumMg"]);
    const visibleNutrients = Array.isArray(payload.settings?.nutrition?.visibleNutrients)
      ? payload.settings.nutrition.visibleNutrients.filter((key): key is NutrientKey => allowedNutrients.has(key as NutrientKey))
      : ["energyKcal", "proteinG", "carbohydrateG", "fatG"] satisfies NutrientKey[];
    return {
      manifest,
      recipes,
      settings: { debugMode: Boolean(payload.settings?.debugMode), nutrition: { visibleNutrients } },
      history: payload.history || [],
    };
  } catch (error) {
    throw new AppError("BACKUP", error instanceof Error ? error.message : String(error), error);
  }
}
