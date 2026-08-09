import type { LogEntry } from "./types.ts";

export type TokenUsagePeriod = "session" | "week" | "month" | "all";

export interface ParsedTokenUsage {
  dishName: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  answerTokens: number;
  reasoningAvailable: boolean;
  totalTokens: number;
}

export interface TokenUsageDish extends Omit<ParsedTokenUsage, "dishName" | "reasoningAvailable"> {
  name: string;
  requestCount: number;
}

export interface TokenUsageDay {
  date: string;
  totalTokens: number;
  requestCount: number;
}

export interface TokenUsageAnalytics {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  answerTokens: number;
  totalTokens: number;
  unavailableCount: number;
  unseparatedCount: number;
  dishes: TokenUsageDish[];
  days: TokenUsageDay[];
}

function tokenValue(message: string, label: string) {
  const match = message.match(new RegExp(`${label}=(\\d+)\\s*token`, "i"));
  return match ? Number(match[1]) : 0;
}

export function parseTokenUsageLog(entry: LogEntry): ParsedTokenUsage | undefined {
  if (entry.event !== "recipe_token_usage" || !entry.message) return undefined;
  const dishMatch = entry.message.match(/菜名=([^；;]+)/);
  if (!dishMatch) return undefined;
  const inputTokens = tokenValue(entry.message, "输入");
  const outputTokens = tokenValue(entry.message, "输出");
  const reasoningAvailable = /思考=\d+\s*token/i.test(entry.message);
  const reasoningTokens = tokenValue(entry.message, "思考");
  const loggedAnswer = tokenValue(entry.message, "回答");
  const answerTokens = reasoningAvailable ? loggedAnswer || Math.max(0, outputTokens - reasoningTokens) : outputTokens;
  const reportedTotal = tokenValue(entry.message, "总计");
  return {
    dishName: dishMatch[1].trim() || "未识别菜名",
    inputTokens,
    outputTokens,
    reasoningTokens,
    answerTokens,
    reasoningAvailable,
    totalTokens: reportedTotal || inputTokens + outputTokens,
  };
}

function periodStart(period: TokenUsagePeriod, now: Date, sessionStartedAt: Date) {
  if (period === "session") return sessionStartedAt.getTime();
  if (period === "week") return now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return Number.NEGATIVE_INFINITY;
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildTokenUsageAnalytics(
  logs: LogEntry[],
  period: TokenUsagePeriod,
  now = new Date(),
  sessionStartedAt = now,
): TokenUsageAnalytics {
  const start = periodStart(period, now, sessionStartedAt);
  const end = now.getTime();
  const dishes = new Map<string, TokenUsageDish>();
  const days = new Map<string, TokenUsageDay>();
  const result: TokenUsageAnalytics = {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    answerTokens: 0,
    totalTokens: 0,
    unavailableCount: 0,
    unseparatedCount: 0,
    dishes: [],
    days: [],
  };

  for (const entry of logs) {
    const timestamp = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) continue;
    const usage = parseTokenUsageLog(entry);
    if (!usage) continue;
    result.requestCount += 1;
    result.inputTokens += usage.inputTokens;
    result.outputTokens += usage.outputTokens;
    result.reasoningTokens += usage.reasoningTokens;
    result.answerTokens += usage.answerTokens;
    result.totalTokens += usage.totalTokens;
    if (usage.inputTokens === 0 && usage.outputTokens === 0 && usage.totalTokens === 0) result.unavailableCount += 1;
    if (!usage.reasoningAvailable && usage.outputTokens > 0) result.unseparatedCount += 1;

    const dish = dishes.get(usage.dishName) || { name: usage.dishName, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, answerTokens: 0, totalTokens: 0, requestCount: 0 };
    dish.inputTokens += usage.inputTokens;
    dish.outputTokens += usage.outputTokens;
    dish.reasoningTokens += usage.reasoningTokens;
    dish.answerTokens += usage.answerTokens;
    dish.totalTokens += usage.totalTokens;
    dish.requestCount += 1;
    dishes.set(usage.dishName, dish);

    const date = localDateKey(timestamp);
    const day = days.get(date) || { date, totalTokens: 0, requestCount: 0 };
    day.totalTokens += usage.totalTokens;
    day.requestCount += 1;
    days.set(date, day);
  }
  result.dishes = [...dishes.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.name.localeCompare(b.name, "zh-CN"));
  result.days = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return result;
}
