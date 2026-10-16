type Context = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", event: string, context: Context = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logInfo = (event: string, context?: Context) => emit("info", event, context);
export const logWarn = (event: string, context?: Context) => emit("warn", event, context);

export function logError(event: string, error: unknown, context: Context = {}) {
  const e = error instanceof Error ? error : new Error(String(error));
  emit("error", event, { ...context, errorName: e.name, message: e.message, stack: e.stack });
}
