import type { AppSettings, LogEntry, Recipe, RecommendationHistory } from "./types";
import { toAppError } from "./errors";

const DB_NAME = "zaofan-local";
const DB_VERSION = 1;
const LOG_LIMIT = 500;

type StoreName = "recipes" | "settings" | "history" | "logs";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function openDatabase() {
  if (typeof indexedDB === "undefined") throw toAppError("IndexedDB unavailable", "STORAGE");
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("recipes")) db.createObjectStore("recipes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
      if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "id" });
      if (!db.objectStoreNames.contains("logs")) {
        const store = db.createObjectStore("logs", { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toAppError(request.error, "STORAGE"));
    request.onblocked = () => reject(toAppError("数据库升级被其他页面阻止", "STORAGE"));
  });
}

async function transact<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => Promise<T>,
) {
  const db = await openDatabase();
  try {
    const tx = db.transaction(stores, mode);
    const value = await action(tx);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
    });
    return value;
  } catch (error) {
    throw toAppError(error, "STORAGE");
  } finally {
    db.close();
  }
}

export const recipeStore = {
  all: () =>
    transact(["recipes"], "readonly", (tx) =>
      requestResult<Recipe[]>(tx.objectStore("recipes").getAll()),
    ),
  get: (id: string) =>
    transact(["recipes"], "readonly", (tx) =>
      requestResult<Recipe | undefined>(tx.objectStore("recipes").get(id)),
    ),
  put: (recipe: Recipe) =>
    transact(["recipes"], "readwrite", async (tx) => {
      await requestResult(tx.objectStore("recipes").put(recipe));
      return recipe;
    }),
  delete: (id: string) =>
    transact(["recipes"], "readwrite", async (tx) => {
      await requestResult(tx.objectStore("recipes").delete(id));
    }),
  replaceAll: (recipes: Recipe[]) =>
    transact(["recipes"], "readwrite", async (tx) => {
      const store = tx.objectStore("recipes");
      await requestResult(store.clear());
      for (const recipe of recipes) await requestResult(store.put(recipe));
    }),
};

const defaultSettings: AppSettings = {
  debugMode: false,
  ai: {
    endpoint: envValue("VITE_AI_ENDPOINT") || "https://api.deepseek.com/chat/completions",
    model: envValue("VITE_AI_MODEL"),
    apiKey: "",
    enabled: envValue("VITE_AI_ENABLED") === "true",
  },
  nutrition: { visibleNutrients: ["energyKcal", "proteinG", "carbohydrateG", "fatG"] },
};

function envValue(key: string) {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.[key]?.trim() || "";
}

export const settingsStore = {
  get: async () =>
    transact(["settings"], "readonly", async (tx) => {
      const saved = await requestResult<Partial<AppSettings> | undefined>(tx.objectStore("settings").get("app"));
      if (!saved) return defaultSettings;
      return {
        ...defaultSettings,
        ...saved,
        ai: { ...defaultSettings.ai, ...saved.ai },
        nutrition: {
          visibleNutrients: Array.isArray(saved.nutrition?.visibleNutrients)
            ? saved.nutrition.visibleNutrients
            : defaultSettings.nutrition.visibleNutrients,
        },
      };
    }),
  put: (settings: AppSettings) =>
    transact(["settings"], "readwrite", async (tx) => {
      await requestResult(tx.objectStore("settings").put(settings, "app"));
      return settings;
    }),
};

export const historyStore = {
  all: () =>
    transact(["history"], "readonly", (tx) =>
      requestResult<RecommendationHistory[]>(tx.objectStore("history").getAll()),
    ),
  put: (history: RecommendationHistory) =>
    transact(["history"], "readwrite", async (tx) => {
      await requestResult(tx.objectStore("history").put(history));
    }),
};

export const logStore = {
  all: () =>
    transact(["logs"], "readonly", (tx) =>
      requestResult<LogEntry[]>(tx.objectStore("logs").getAll()),
    ).then((entries) => entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))),
  add: (entry: LogEntry) =>
    transact(["logs"], "readwrite", async (tx) => {
      const store = tx.objectStore("logs");
      await requestResult(store.put(entry));
      const keys = await requestResult<IDBValidKey[]>(store.index("timestamp").getAllKeys());
      const excess = keys.length - LOG_LIMIT;
      for (let i = 0; i < excess; i += 1) await requestResult(store.delete(keys[i]));
    }),
  clear: () =>
    transact(["logs"], "readwrite", async (tx) => {
      await requestResult(tx.objectStore("logs").clear());
    }),
};

export async function clearBusinessData() {
  return transact(["recipes", "history"], "readwrite", async (tx) => {
    await requestResult(tx.objectStore("recipes").clear());
    await requestResult(tx.objectStore("history").clear());
  });
}
