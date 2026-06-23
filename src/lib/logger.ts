type LogLevel = "debug" | "info" | "warn" | "error";

const order: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL as LogLevel | undefined;
  return raw && raw in order ? raw : "info";
}

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/secret|token|api[_-]?key|authorization|payment/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = sanitize(entry);
    }
  }
  return out;
}

export function log(level: LogLevel, message: string, metadata: Record<string, unknown> = {}) {
  if (order[level] < order[configuredLevel()]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(sanitize(metadata) as Record<string, unknown>)
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>) => log("debug", message, metadata),
  info: (message: string, metadata?: Record<string, unknown>) => log("info", message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => log("warn", message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => log("error", message, metadata)
};

export async function loggedExternalCall<T>(
  input: {
    provider: string;
    operation: string;
    requestId?: string | null;
    traceId?: string | null;
    metadata?: Record<string, unknown>;
  },
  run: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  logger.info("external_api.started", input);
  try {
    const result = await run();
    logger.info("external_api.completed", {
      ...input,
      durationMs: Date.now() - started
    });
    return result;
  } catch (error) {
    logger.error("external_api.failed", {
      ...input,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown external API error"
    });
    throw error;
  }
}
