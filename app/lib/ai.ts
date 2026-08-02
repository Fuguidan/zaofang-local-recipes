import type { AIProviderConfig, RecipeInput } from "./types";
import { AppError } from "./errors.ts";
import { isAiSupportedImage } from "./images.ts";
import { CapacitorHttp } from "@capacitor/core";

export type AIFailure =
  | "auth_failed"
  | "rate_limited"
  | "cors_or_network"
  | "vision_not_supported"
  | "bad_response_json"
  | "bad_model_payload"
  | "bad_recipe_json";

const SYSTEM_PROMPT = `你是菜谱结构化助手。根据用户提供的菜品图片、菜品名称或补充文字生成菜谱草稿，仅返回JSON：
{"name":"","description":"","ingredients":[{"name":"","amount":"","unit":"","note":""}],"steps":[""],"meals":["breakfast|lunch|dinner"],"flavors":["清淡|辛辣|酸甜|咸鲜|麻辣|鲜香"],"tags":[],"dietType":"荤菜|素菜|主食|汤羹","duration":30,"difficulty":"简单|适中|进阶"}。不要返回Markdown。`;

const MEALS = new Set(["breakfast", "lunch", "dinner"]);
const FLAVORS = new Set(["清淡", "辛辣", "酸甜", "咸鲜", "麻辣", "鲜香"]);
const DIET_TYPES = new Set(["荤菜", "素菜", "主食", "汤羹"]);
const DIFFICULTIES = new Set(["简单", "适中", "进阶"]);
const VISION_ERROR_PATTERN = /image|vision|visual|modal|multimodal|image_url|content type|图片|视觉|多模态/i;
export const LOCAL_AI_PROXY_PATH = "/__local_ai_proxy/chat/completions";

const failureSuggestions: Record<AIFailure, string> = {
  auth_failed: "鉴权失败，请检查 API Key 是否正确，或确认接口地址属于同一家服务。",
  rate_limited: "请求被限流或额度不足，请稍后重试，或检查模型服务额度。",
  cors_or_network: "浏览器无法连接模型接口。Web 端常见原因是 CORS 拦截、网络不可达或接口地址错误。",
  vision_not_supported: "接口可连接，但当前模型或服务不支持图片输入。请换支持视觉的模型，或只填写菜名生成。",
  bad_response_json: "接口返回的内容不是 JSON，请确认接口地址是 OpenAI-compatible Chat Completions。",
  bad_model_payload: "接口返回格式不包含可识别的模型文本内容，请确认接口兼容 Chat Completions 或 Responses 文本输出。",
  bad_recipe_json: "模型返回了内容，但不是可解析的菜谱 JSON。请换模型或调整模型输出格式。",
};

export class AIRequestError extends AppError {
  readonly failure: AIFailure;
  readonly status?: number;
  readonly suggestion: string;

  constructor(failure: AIFailure, detail?: string, status?: number, cause?: unknown) {
    super("NETWORK", detail || failureSuggestions[failure], cause);
    this.failure = failure;
    this.status = status;
    this.suggestion = failureSuggestions[failure];
  }
}

export function resolveAIRequestTarget(
  endpoint: string,
  environment?: { pageUrl?: string; isNativeApp?: boolean },
) {
  const pageUrl = environment?.pageUrl || (typeof window === "undefined" ? undefined : window.location.href);
  const isNativeApp = environment?.isNativeApp ?? isCapacitorNativeApp();
  if (!pageUrl || isNativeApp) return endpoint;
  let page: URL;
  let target: URL;
  try {
    page = new URL(pageUrl);
    target = new URL(endpoint);
  } catch {
    return endpoint;
  }
  if (!["http:", "https:"].includes(page.protocol)) return endpoint;
  if (page.origin === target.origin) return endpoint;
  return `${LOCAL_AI_PROXY_PATH}?target=${encodeURIComponent(endpoint)}`;
}

function isCapacitorNativeApp() {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = (window as typeof window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(maybeCapacitor?.isNativePlatform?.());
}

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

export async function testAIVisionCapability(config: AIProviderConfig, signal?: AbortSignal) {
  await generateRecipeDraft({
    image: tinyJpegBlob(),
    name: "图片能力测试",
    description: "仅测试接口是否接受图片输入",
    config,
    signal,
  });
}

function tinyJpegBlob() {
  const base64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGqP//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8BP//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8BP//Z";
  if (typeof atob === "undefined") return new Blob([Buffer.from(base64, "base64")], { type: "image/jpeg" });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/jpeg" });
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
  const aiImage = isAiSupportedImage(image) ? image : undefined;
  if (!aiImage && !name?.trim()) {
    throw new AppError("VALIDATION", "请先上传可用于 AI 的图片或填写菜名");
  }
  const dataUrl = aiImage ? await readAsDataUrl(aiImage) : undefined;
  const text = [
    name?.trim() ? `菜品名称：${name.trim()}` : "",
    description?.trim() ? `补充说明：${description.trim()}` : "",
    aiImage ? "请结合图片生成菜谱草稿。" : "请根据菜品名称生成菜谱草稿。",
  ].filter(Boolean).join("\n");
  const requestBody = {
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
  };
  let response: Response;
  try {
    if (isCapacitorNativeApp()) {
      if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
      const nativeResponse = await CapacitorHttp.request({
        url: config.endpoint,
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        data: requestBody,
        responseType: "json",
        connectTimeout: 30_000,
        readTimeout: 120_000,
      });
      response = new Response(
        typeof nativeResponse.data === "string" ? nativeResponse.data : JSON.stringify(nativeResponse.data),
        { status: nativeResponse.status, headers: nativeResponse.headers },
      );
    } else {
      response = await fetch(resolveAIRequestTarget(config.endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(requestBody),
        signal,
      });
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AIRequestError("cors_or_network", error instanceof Error ? error.message : "网络请求失败", undefined, error);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw classifyHttpError(response.status, text);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new AIRequestError("bad_response_json", "接口返回的内容不是 JSON", response.status, error);
  }
  const content = stripJsonFence(extractModelContent(body));
  if (!content) throw new AIRequestError("bad_model_payload", "模型未返回可识别的文本内容", response.status);
  try {
    return normalizeDraft(JSON.parse(content) as Partial<RecipeInput>);
  } catch (error) {
    throw new AIRequestError("bad_recipe_json", "模型响应不是有效菜谱 JSON", response.status, error);
  }
}

function extractModelContent(body: unknown): string {
  if (!isRecord(body)) return "";
  const outputText = firstString(body.output_text);
  if (outputText) return outputText;
  const choices = Array.isArray(body.choices) ? body.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const message = isRecord(choice.message) ? choice.message : undefined;
    const messageContent = extractContentValue(message?.content);
    if (messageContent) return messageContent;
    const choiceText = firstString(choice.text);
    if (choiceText) return choiceText;
  }
  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const outputContent = extractContentValue(item.content);
    if (outputContent) return outputContent;
  }
  return "";
}

function extractContentValue(value: unknown): string {
  const direct = firstString(value);
  if (direct) return direct;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      return firstString(part.text) || firstString(part.content);
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function firstString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripJsonFence(content: string) {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function classifyHttpError(status: number, text: string) {
  const detail = summarizeRemoteError(text) || `接口返回 ${status}`;
  if (status === 401 || status === 403) return new AIRequestError("auth_failed", detail, status);
  if (status === 429) return new AIRequestError("rate_limited", detail, status);
  if (status === 502 || status === 503 || status === 504) return new AIRequestError("cors_or_network", detail, status);
  if ((status === 400 || status === 422) && VISION_ERROR_PATTERN.test(text)) {
    return new AIRequestError("vision_not_supported", detail, status);
  }
  return new AIRequestError("bad_model_payload", detail, status);
}

function summarizeRemoteError(text: string) {
  if (!text) return "";
  try {
    const body = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return (body.error?.message || body.message || "").slice(0, 180);
  } catch {
    return text.slice(0, 180);
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
