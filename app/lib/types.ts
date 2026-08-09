export type MealType = "breakfast" | "lunch" | "dinner";
export type Flavor = "清淡" | "辛辣" | "酸甜" | "咸鲜" | "麻辣" | "鲜香";
export type DietType = "荤菜" | "素菜" | "主食" | "汤羹";
export type Difficulty = "简单" | "适中" | "进阶";

export interface Ingredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
  note?: string;
  grams?: number;
  foodId?: string;
  foodName?: string;
  nutritionMatch?: "confirmed" | "suggested" | "unmatched";
}

export type NutrientKey = "energyKcal" | "proteinG" | "carbohydrateG" | "fatG" | "fiberG" | "sodiumMg";

export interface NutrientValues {
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
}

export interface NutritionSettings {
  visibleNutrients: NutrientKey[];
  estimatePeople: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  meals: MealType[];
  flavors: Flavor[];
  tags: string[];
  dietType: DietType;
  duration: number;
  difficulty: Difficulty;
  image?: Blob;
  imageName?: string;
  incomplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecipeInput = Omit<Recipe, "id" | "createdAt" | "updatedAt">;

export interface RecommendationRequest {
  people: number;
  meal: MealType;
  flavors: Flavor[];
  tags: string[];
}

export interface RecommendationResult {
  targetCount: number;
  recipes: Recipe[];
  shortage: number;
  reason: string;
}

export interface RecommendationHistory {
  id: string;
  recipeIds: string[];
  meal: MealType;
  createdAt: string;
}

export interface AIProviderConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  module: string;
  event: string;
  operationId: string;
  stage?: string;
  result?: string;
  durationMs?: number;
  errorCode?: string;
  message?: string;
}

export interface AppSettings {
  debugMode: boolean;
  ai: AIProviderConfig;
  nutrition: NutritionSettings;
}

export interface BackupManifest {
  format: "zaofan-backup";
  version: 1;
  appVersion: string;
  createdAt: string;
  recipeCount: number;
  imageFiles: string[];
}
