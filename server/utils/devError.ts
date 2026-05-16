const DEBUG_KEYS = [
  'status',
  'code',
  'type',
  'param',
  'requestID',
  'request_id',
];

export function getDevErrorDetails(err: unknown): Record<string, unknown> | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return serializeError(err);
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...pickKnownFields(err as unknown as Record<string, unknown>),
      ...(err.cause ? { cause: serializeError(err.cause) } : {}),
    };
  }
  if (err && typeof err === 'object') {
    return pickKnownFields(err as Record<string, unknown>);
  }
  return { value: String(err) };
}

function pickKnownFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DEBUG_KEYS) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  const nested = obj.error;
  if (nested && typeof nested === 'object') {
    out.error = pickKnownFields(nested as Record<string, unknown>);
    const message = (nested as Record<string, unknown>).message;
    if (message !== undefined) {
      out.error = { ...(out.error as Record<string, unknown>), message };
    }
  }
  return out;
}
