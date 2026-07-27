import { logStore, settingsStore } from "./storage";
import type { LogEntry, LogLevel } from "./types";

const secretKeys = /api[-_]?key|authorization|token|secret|image|blob|content/i;

function sanitize(value: unknown) {
  if (!value) return undefined;
  const text = value instanceof Error ? value.message : String(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 240);
}

export interface LogContext {
  stage?: string;
  result?: string;
  durationMs?: number;
  errorCode?: string;
  message?: unknown;
  [key: string]: unknown;
}

export async function writeLog(
  level: LogLevel,
  module: string,
  event: string,
  operationId = crypto.randomUUID(),
  context: LogContext = {},
) {
  const settings = await settingsStore.get().catch(() => null);
  if (!settings?.debugMode && (level === "debug" || level === "info") && process.env.NODE_ENV === "production") return;
  const safeContext = Object.fromEntries(Object.entries(context).filter(([key]) => !secretKeys.test(key)));
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    module,
    event,
    operationId,
    stage: typeof safeContext.stage === "string" ? safeContext.stage : undefined,
    result: typeof safeContext.result === "string" ? safeContext.result : undefined,
    durationMs: typeof safeContext.durationMs === "number" ? safeContext.durationMs : undefined,
    errorCode: typeof safeContext.errorCode === "string" ? safeContext.errorCode : undefined,
    message: sanitize(safeContext.message),
  };
  await logStore.add(entry).catch(() => undefined);
  if (process.env.NODE_ENV !== "production") console[level](`[${module}] ${event}`, entry);
}

export const logger = {
  debug: (module: string, event: string, operationId?: string, context?: LogContext) =>
    writeLog("debug", module, event, operationId, context),
  info: (module: string, event: string, operationId?: string, context?: LogContext) =>
    writeLog("info", module, event, operationId, context),
  warn: (module: string, event: string, operationId?: string, context?: LogContext) =>
    writeLog("warn", module, event, operationId, context),
  error: (module: string, event: string, operationId?: string, context?: LogContext) =>
    writeLog("error", module, event, operationId, context),
};
