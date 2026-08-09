import assert from "node:assert/strict";
import test from "node:test";
import { buildTokenUsageAnalytics, parseTokenUsageLog } from "../app/lib/token-analytics.ts";
import type { LogEntry } from "../app/lib/types.ts";

function usageLog(timestamp: string, message: string, id = crypto.randomUUID()): LogEntry {
  return { id, timestamp, level: "info", module: "ai", event: "recipe_token_usage", operationId: id, message };
}

test("parses per-dish token usage logs and ignores unavailable values", () => {
  assert.deepEqual(parseTokenUsageLog(usageLog("2026-08-09T08:00:00.000Z", "菜名=番茄炒蛋；输入=246 token；输出=73 token；总计=319 token")), {
    dishName: "番茄炒蛋", inputTokens: 246, outputTokens: 73, totalTokens: 319,
  });
  assert.deepEqual(parseTokenUsageLog(usageLog("2026-08-09T08:00:00.000Z", "菜名=红烧肉；输入=服务未提供 token；输出=服务未提供 token；总计=服务未提供 token")), {
    dishName: "红烧肉", inputTokens: 0, outputTokens: 0, totalTokens: 0,
  });
  assert.equal(parseTokenUsageLog({ ...usageLog("2026-08-09T08:00:00.000Z", "irrelevant"), event: "startup_ready" }), undefined);
});

test("summarizes token usage by selected period and dish", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const logs = [
    usageLog("2026-08-09T10:00:00.000Z", "菜名=番茄炒蛋；输入=100 token；输出=20 token；总计=120 token", "1"),
    usageLog("2026-08-08T10:00:00.000Z", "菜名=红烧肉；输入=200 token；输出=50 token；总计=250 token", "2"),
    usageLog("2026-07-20T10:00:00.000Z", "菜名=番茄炒蛋；输入=300 token；输出=80 token；总计=380 token", "3"),
  ];
  const weekly = buildTokenUsageAnalytics(logs, "week", now, new Date("2026-08-09T09:00:00.000Z"));
  assert.equal(weekly.requestCount, 2);
  assert.equal(weekly.inputTokens, 300);
  assert.equal(weekly.outputTokens, 70);
  assert.equal(weekly.totalTokens, 370);
  assert.deepEqual(weekly.dishes.map((item) => [item.name, item.totalTokens]), [["红烧肉", 250], ["番茄炒蛋", 120]]);

  const session = buildTokenUsageAnalytics(logs, "session", now, new Date("2026-08-09T09:00:00.000Z"));
  assert.equal(session.requestCount, 1);
  assert.equal(session.totalTokens, 120);
});
