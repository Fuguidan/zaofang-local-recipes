import type { AIProviderConfig, RecipeInput } from "./types";
import { AppError } from "./errors.ts";

const SYSTEM_PROMPT = `你是菜谱结构化助手。根据用户提供的菜品图片、菜品名称或补充文字生成菜谱草稿，仅返回JSON：
{"name":"","description":"","ingredients":[{"name":"","amount":"","unit":"","note":""}],"steps":[""],"meals":["breakfast|lunch|dinner"],"flavors":["清淡|辛辣|酸甜|咸鲜|麻辣|鲜香"],"tags":[],"dietType":"荤菜|素菜|主食|汤羹","duration":30,"difficulty":"简单|适中|进阶"}。不要返回Markdown。`;

const MEALS = new Set(["breakfast", "lunch", "dinner"]);
const FLAVORS = new Set(["清淡", "辛辣", "酸甜", "咸鲜", "麻辣", "鲜香"]);
const DIET_TYPES = new Set(["荤菜", "素菜", "主食", "汤羹"]);
const DIFFICULTIES = new Set(["简单", "适中", "进阶"]);

function readAsDataUrl(file: Blob) {
  if (typeof FileReader === "undefined") {
    return file.arrayBuffer().then((buffer) => {
      const base64 = Buffer.from(buffer).toString("base64");
      return `data:${file.type || "application/octet-stream"};base64,${base64}`;
    });
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function parseRecipeImage(
  image: Blob,
  description: string,
  config: AIProviderConfig,
  signal?: AbortSignal,
): Promise<Partial<RecipeInput>> {
  return generateRecipeDraft({ image, description, config, signal });
}

export async function generateRecipeDraft({
  image,
  name,
  description,
  config,
  signal,
}: {
  image?: Blob;
  name?: string;
  description?: string;
  config: AIProviderConfig;
  signal?: AbortSignal;
}): Promise<Partial<RecipeInput>> {
  if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) {
    throw new AppError("NETWORK", "未配置或未启用 AI 生成");
  }
  if (!image && !name?.trim()) {
    throw new AppError("VALIDATION", "请先上传图片或填写菜名");
  }
  const dataUrl = image ? await readAsDataUrl(image) : undefined;
  const text = [
    name?.trim() ? `菜品名称：${name.trim()}` : "",
    description?.trim() ? `补充说明：${description.trim()}` : "",
    image ? "请结合图片生成菜谱草稿。" : "请根据菜品名称生成菜谱草稿。",
  ].filter(Boolean).join("\n");
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: dataUrl
              ? [
                  { type: "text", text },
                  { type: "image_url", image_url: { url: dataUrl } },
                ]
              : text,
          },
        ],
      }),
      signal,
    });
  } catch (error) {
    throw new AppError("NETWORK", error instanceof Error ? error.message : "网络请求失败", error);
  }
  if (!response.ok) {
    const reason =
      response.status === 401 ? "API Key 无效" :
      response.status === 429 ? "请求过于频繁或额度不足" :
      `接口返回 ${response.status}`;
    throw new AppError("NETWORK", reason);
  }
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content?.replace(/^```json\s*|\s*```$/g, "");
  if (!content) throw new AppError("NETWORK", "模型未返回可解析内容");
  try {
    return normalizeDraft(JSON.parse(content) as Partial<RecipeInput>);
  } catch (error) {
    throw new AppError("NETWORK", "模型响应不是有效 JSON", error);
  }
}

function normalizeDraft(draft: Partial<RecipeInput>): Partial<RecipeInput> {
  return {
    ...draft,
    name: typeof draft.name === "string" ? draft.name : undefined,
    description: typeof draft.description === "string" ? draft.description : undefined,
    ingredients: Array.isArray(draft.ingredients)
      ? draft.ingredients
          .filter((item) => item && typeof item.name === "string")
          .map((item) => ({
            id: item.id || crypto.randomUUID(),
            name: item.name,
            amount: typeof item.amount === "string" ? item.amount : "",
            unit: typeof item.unit === "string" ? item.unit : "",
            note: typeof item.note === "string" ? item.note : undefined,
          }))
      : undefined,
    steps: Array.isArray(draft.steps) ? draft.steps.filter((step): step is string => typeof step === "string") : undefined,
    meals: Array.isArray(draft.meals) ? draft.meals.filter((meal) => MEALS.has(meal)) : undefined,
    flavors: Array.isArray(draft.flavors) ? draft.flavors.filter((flavor) => FLAVORS.has(flavor)) : undefined,
    tags: Array.isArray(draft.tags) ? draft.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
    dietType: draft.dietType && DIET_TYPES.has(draft.dietType) ? draft.dietType : undefined,
    duration: typeof draft.duration === "number" && Number.isFinite(draft.duration) ? draft.duration : undefined,
    difficulty: draft.difficulty && DIFFICULTIES.has(draft.difficulty) ? draft.difficulty : undefined,
  };
}
