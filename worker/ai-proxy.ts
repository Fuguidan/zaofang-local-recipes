export async function proxyAIRequest(request: Request, url: URL): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: { message: "AI proxy only accepts POST" } }, 405, corsHeaders);
  let target: URL;
  try {
    target = new URL(url.searchParams.get("target") || "");
    if (!["https:", "http:"].includes(target.protocol)) throw new Error("unsupported protocol");
  } catch {
    return jsonResponse({ error: { message: "invalid target endpoint" } }, 400, corsHeaders);
  }
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        ...(request.headers.get("authorization") ? { Authorization: request.headers.get("authorization")! } : {}),
      },
      body: request.body,
    });
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return jsonResponse({ error: { message: "AI proxy failed to reach target endpoint" } }, 502, corsHeaders);
  }
}

function jsonResponse(value: unknown, status: number, extraHeaders: Record<string, string>) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  return new Response(JSON.stringify(value), { status, headers });
}
