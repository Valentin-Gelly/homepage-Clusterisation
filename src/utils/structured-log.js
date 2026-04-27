function normalizeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
}

export default function structuredLog(level, payload) {
  const safePayload = Object.fromEntries(
    Object.entries(payload || {}).map(([key, value]) => [key, normalizeValue(value)]),
  );

  const entry = {
    timestamp: new Date().toISOString(),
    service: process.env.OTEL_SERVICE_NAME || "homepage",
    level,
    _msg: safePayload.msg || "application event",
    ...safePayload,
  };

  const line = `${JSON.stringify(entry)}\n`;
  if (level === "error" || level === "warn") {
    process.stderr?.write?.(line);
    return;
  }
  process.stdout?.write?.(line);
}
