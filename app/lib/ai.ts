import type { AIProviderConfig, RecipeInput } from "./types";
import { AppError } from "./errors";

const SYSTEM_PROMPT = `你是菜谱结构化助手。根据图片和补充文字，仅返回JSON：
{"name":"","description":"","ingredients":[{"name":"","amount":"","unit":"","note":""}],"steps":[""],"meals":["breakfast|lunch|dinner"],"flavors":["清淡|辛辣|酸甜|咸鲜|麻辣|鲜香"],"tags":[],"dietType":"荤菜|素菜|主食|汤羹","duration":30,"difficulty":"简单|适中|进阶"}。不要返回Markdown。`;

function readAsDataUrl(file: Blob) {
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
  if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) {
    throw new AppError("NETWORK", "未配置或未启用图片解析");
  }
  const dataUrl = await readAsDataUrl(image);
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
            content: [
              { type: "text", text: description || "请识别这道菜" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
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
    return JSON.parse(content) as Partial<RecipeInput>;
  } catch (error) {
    throw new AppError("NETWORK", "模型响应不是有效 JSON", error);
  }
}
