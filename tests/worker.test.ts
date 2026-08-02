import assert from "node:assert/strict";
import test from "node:test";
import { proxyAIRequest } from "../worker/ai-proxy.ts";

test("production AI proxy forwards the request without exposing the browser to CORS", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded: { url?: string; authorization?: string; body?: string } = {};
  globalThis.fetch = (async (input, init) => {
    forwarded = {
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization") || undefined,
      body: init?.body ? await new Response(init.body as BodyInit).text() : undefined,
    };
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const request = new Request("https://recipes.example/__local_ai_proxy/chat/completions?target=https%3A%2F%2Fmodel.example%2Fv1%2Fchat%2Fcompletions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-key" },
      body: JSON.stringify({ model: "vision", messages: [] }),
    });
    const response = await proxyAIRequest(request, new URL(request.url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(forwarded.url, "https://model.example/v1/chat/completions");
    assert.equal(forwarded.authorization, "Bearer test-key");
    assert.match(forwarded.body || "", /vision/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production AI proxy returns a structured error for unreachable upstream", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError("network down"); }) as typeof fetch;
  try {
    const request = new Request("https://recipes.example/__local_ai_proxy/chat/completions?target=https%3A%2F%2Fmodel.example%2Fv1%2Fchat%2Fcompletions", { method: "POST", body: "{}" });
    const response = await proxyAIRequest(request, new URL(request.url));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: { message: "AI proxy failed to reach target endpoint" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
