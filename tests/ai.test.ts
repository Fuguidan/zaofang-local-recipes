import assert from "node:assert/strict";
import test from "node:test";
import { generateRecipeDraft } from "../app/lib/ai.ts";
import { isHeicImage } from "../app/lib/images.ts";
import type { AIProviderConfig } from "../app/lib/types.ts";

const enabledConfig: AIProviderConfig = {
  endpoint: "https://example.test/chat/completions",
  model: "vision-model",
  apiKey: "sk-test-secret",
  enabled: true,
};

const aiResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          name: "番茄炒蛋",
          description: "家常快手菜",
          ingredients: [{ name: "番茄", amount: "2", unit: "个" }],
          steps: ["切番茄", "炒鸡蛋"],
          meals: ["lunch"],
          flavors: ["酸甜"],
          tags: ["快手菜"],
          dietType: "素菜",
          duration: 15,
          difficulty: "简单",
        }),
      },
    },
  ],
};

test("does not call AI when generation is disabled", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => generateRecipeDraft({ name: "番茄炒蛋", config: { ...enabledConfig, enabled: false } }),
      /未配置或未启用 AI 生成/,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generates recipe draft from dish name only", async () => {
  const bodies: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    const draft = await generateRecipeDraft({ name: "番茄炒蛋", config: enabledConfig });
    assert.equal(draft.name, "番茄炒蛋");
    assert.equal(draft.ingredients?.[0].name, "番茄");
    const body = bodies[0] as { messages: Array<{ content: unknown }> };
    assert.equal(typeof body.messages[1].content, "string");
    assert.match(String(body.messages[1].content), /菜品名称：番茄炒蛋/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generates recipe draft from image and text", async () => {
  const bodies: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    await generateRecipeDraft({
      image: new Blob(["image-bytes"], { type: "image/jpeg" }),
      name: "番茄炒蛋",
      description: "偏甜口",
      config: enabledConfig,
    });
    const body = bodies[0] as { messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { url: string } }> }> };
    assert.equal(Array.isArray(body.messages[1].content), true);
    assert.equal(body.messages[1].content[0].type, "text");
    assert.equal(body.messages[1].content[1].type, "image_url");
    assert.match(body.messages[1].content[1].image_url?.url || "", /^data:image\/jpeg;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recognizes Apple HEIC and HEIF uploads", () => {
  assert.equal(isHeicImage(new File(["x"], "photo.HEIC", { type: "" })), true);
  assert.equal(isHeicImage(new File(["x"], "photo.jpg", { type: "image/heif" })), true);
  assert.equal(isHeicImage(new File(["x"], "photo.jpg", { type: "image/jpeg" })), false);
});
