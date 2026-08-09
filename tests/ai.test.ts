import assert from "node:assert/strict";
import test from "node:test";
import { AIRequestError, generateRecipeDraft, LOCAL_AI_PROXY_PATH, normalizeAIConfig, normalizeAIEndpoint, resolveAIRequestTarget, testAIVisionCapability } from "../app/lib/ai.ts";
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

const recipeJson = aiResponse.choices[0].message.content;

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

test("asks the model to estimate editable ingredient grams for the configured people count", async () => {
  const bodies: unknown[] = [];
  const responseWithGrams = structuredClone(aiResponse);
  responseWithGrams.choices[0].message.content = JSON.stringify({
    ...JSON.parse(recipeJson),
    ingredients: [{ name: "番茄", amount: "2", unit: "个", grams: 320 }],
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(responseWithGrams), { status: 200 });
  }) as typeof fetch;
  try {
    const draft = await generateRecipeDraft({ name: "番茄炒蛋", estimatePeople: 2, config: enabledConfig });
    const body = bodies[0] as { messages: Array<{ content: unknown }> };
    assert.match(String(body.messages[1].content), /2\s*人/);
    assert.match(String(body.messages[1].content), /估算.*克数/);
    assert.equal(draft.ingredients?.[0].grams, 320);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generates recipe draft from description only", async () => {
  const bodies: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    const draft = await generateRecipeDraft({ description: "家常红烧肉，偏甜口", config: enabledConfig });
    assert.equal(draft.name, "番茄炒蛋");
    const body = bodies[0] as { messages: Array<{ content: unknown }> };
    assert.equal(typeof body.messages[1].content, "string");
    assert.match(String(body.messages[1].content), /家常红烧肉/);
    assert.doesNotMatch(String(body.messages[1].content), /image_url/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts OpenAI-compatible text completion payload variants", async () => {
  const variants = [
    { choices: [{ text: recipeJson }] },
    { choices: [{ message: { content: [{ type: "text", text: recipeJson }] } }] },
    { choices: [{ message: { content: [{ type: "output_text", text: recipeJson }] } }] },
    { choices: [{ message: { content: { text: recipeJson } } }] },
  ];
  for (const variant of variants) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(variant), { status: 200 })) as typeof fetch;
    try {
      const draft = await generateRecipeDraft({ name: "番茄炒蛋", config: enabledConfig });
      assert.equal(draft.name, "番茄炒蛋");
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("accepts Responses API style output text payloads", async () => {
  const variants = [
    { output_text: recipeJson },
    { output: [{ content: [{ type: "output_text", text: recipeJson }] }] },
    { output: [{ content: [{ type: "text", text: recipeJson }] }] },
  ];
  for (const variant of variants) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(variant), { status: 200 })) as typeof fetch;
    try {
      const draft = await generateRecipeDraft({ name: "番茄炒蛋", config: enabledConfig });
      assert.equal(draft.ingredients?.[0].name, "番茄");
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("routes localhost web AI requests through the local dev proxy", async () => {
  const target = resolveAIRequestTarget("https://api.example.test/v1/chat/completions", {
    pageUrl: "http://localhost:5173/recipes",
    isNativeApp: false,
  });
  assert.match(target, new RegExp(`^${LOCAL_AI_PROXY_PATH}\\?target=`));
  assert.equal(new URL(target, "http://localhost:5173").searchParams.get("target"), "https://api.example.test/v1/chat/completions");
});

test("normalizes copied provider endpoint, model, and API key values", () => {
  assert.equal(normalizeAIEndpoint(" https://dashscope.aliyuncs.com/compatible-mode/v1/ "), "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  const config = normalizeAIConfig({ ...enabledConfig, endpoint: " https://example.test/v1/ ", model: " vision-model ", apiKey: " sk-test-secret " });
  assert.equal(config.endpoint, "https://example.test/v1/chat/completions");
  assert.equal(config.model, "vision-model");
  assert.equal(config.apiKey, "sk-test-secret");
  assert.equal(normalizeAIConfig({ ...enabledConfig, endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3.7-flash" }).model, "qwen3.6-flash");
});

test("uses the same-origin proxy for hosted web pages too", () => {
  const endpoint = "https://api.example.test/v1/chat/completions";
  assert.equal(resolveAIRequestTarget(endpoint, { pageUrl: "http://localhost:5173/app", isNativeApp: true }), endpoint);
  const hostedTarget = resolveAIRequestTarget(endpoint, { pageUrl: "https://recipes.example.test/app", isNativeApp: false });
  assert.match(hostedTarget, new RegExp(`^${LOCAL_AI_PROXY_PATH}\\?target=`));
  assert.equal(resolveAIRequestTarget("http://localhost:5173/api/ai", { pageUrl: "http://localhost:5173/app", isNativeApp: false }), "http://localhost:5173/api/ai");
});

test("generateRecipeDraft uses the local proxy target when running on localhost web", async () => {
  const inputs: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.fetch = (async (input) => {
    inputs.push(String(input));
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "http://localhost:5173/" } },
    });
    await generateRecipeDraft({ name: "番茄炒蛋", config: enabledConfig });
    assert.match(inputs[0], new RegExp(`^${LOCAL_AI_PROXY_PATH}\\?target=`));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    globalThis.fetch = originalFetch;
  }
});

test("uses Capacitor native HTTP on Android to bypass WebView CORS", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { Capacitor: { isNativePlatform: () => true } } });
    const draft = await generateRecipeDraft({ image: new Blob(["image"], { type: "image/jpeg" }), config: enabledConfig });
    assert.equal(draft.name, "番茄炒蛋");
    assert.equal(requests[0], enabledConfig.endpoint);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
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

test("generates recipe draft from image only and sends image_url", async () => {
  const bodies: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    const draft = await generateRecipeDraft({
      image: new Blob(["image-bytes"], { type: "image/jpeg" }),
      config: enabledConfig,
    });
    const body = bodies[0] as { messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { url: string } }> }> };
    assert.equal(draft.name, "番茄炒蛋");
    assert.equal(Array.isArray(body.messages[1].content), true);
    assert.equal(body.messages[1].content[0].type, "text");
    assert.match(body.messages[1].content[0].text || "", /结合图片/);
    assert.equal(body.messages[1].content[1].type, "image_url");
    assert.match(body.messages[1].content[1].image_url?.url || "", /^data:image\/jpeg;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("vision capability test uses a provider-safe image and does not require recipe JSON", async () => {
  const bodies: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: "图片请求已接收" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await testAIVisionCapability(enabledConfig);
    const body = bodies[0] as { messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }> };
    const dataUrl = body.messages[0].content[1].image_url?.url || "";
    assert.match(dataUrl, /^data:image\/png;base64,/);
    const imageBytes = Buffer.from(dataUrl.split(",")[1], "base64");
    assert.equal(imageBytes.readUInt32BE(16), 256);
    assert.equal(imageBytes.readUInt32BE(20), 256);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not send unsupported HEIC image to AI and falls back to dish name", async () => {
  const bodies: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    await generateRecipeDraft({
      image: new Blob(["heic-bytes"], { type: "image/heic" }),
      name: "番茄炒蛋",
      config: enabledConfig,
    });
    const body = bodies[0] as { messages: Array<{ content: unknown }> };
    assert.equal(typeof body.messages[1].content, "string");
    assert.doesNotMatch(String(body.messages[1].content), /image_url/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unsupported HEIC image without a dish name before calling AI", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(aiResponse), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => generateRecipeDraft({ image: new Blob(["heic-bytes"], { type: "image/heic" }), config: enabledConfig }),
      /请先上传可用于 AI 的图片，或填写菜名\/原始说明/,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recognizes Apple HEIC and HEIF uploads", () => {
  assert.equal(isHeicImage(new File(["x"], "photo.HEIC", { type: "" })), true);
  assert.equal(isHeicImage(new File(["x"], "photo.jpg", { type: "image/heif" })), true);
  assert.equal(isHeicImage(new File(["x"], "photo.jpg", { type: "image/jpeg" })), false);
});

async function assertAiFailure(responseOrError: Response | Error, failure: AIRequestError["failure"]) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (responseOrError instanceof Error) throw responseOrError;
    return responseOrError;
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => generateRecipeDraft({ name: "番茄炒蛋", config: enabledConfig }),
      (error: unknown) => error instanceof AIRequestError && error.failure === failure && Boolean(error.suggestion),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("classifies authentication failures", async () => {
  await assertAiFailure(new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 }), "auth_failed");
  await assertAiFailure(new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 }), "auth_failed");
});

test("classifies rate limit failures", async () => {
  await assertAiFailure(new Response(JSON.stringify({ error: { message: "too many requests" } }), { status: 429 }), "rate_limited");
});

test("classifies CORS or network failures", async () => {
  await assertAiFailure(new TypeError("Failed to fetch"), "cors_or_network");
  await assertAiFailure(new Response(JSON.stringify({ error: { message: "local AI proxy failed to reach target endpoint" } }), { status: 502 }), "cors_or_network");
});

test("classifies image unsupported failures", async () => {
  await assertAiFailure(new Response(JSON.stringify({ error: { message: "model does not support image input" } }), { status: 400 }), "vision_not_supported");
  await assertAiFailure(new Response(JSON.stringify({ message: "content type image_url is not supported" }), { status: 422 }), "vision_not_supported");
});

test("classifies bad response JSON", async () => {
  await assertAiFailure(new Response("not json", { status: 200 }), "bad_response_json");
});

test("classifies incompatible model payload", async () => {
  await assertAiFailure(new Response(JSON.stringify({ result: "ok" }), { status: 200 }), "bad_model_payload");
});

test("classifies bad recipe JSON", async () => {
  await assertAiFailure(new Response(JSON.stringify({ choices: [{ message: { content: "不是 JSON" } }] }), { status: 200 }), "bad_recipe_json");
});
