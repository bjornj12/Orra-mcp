export type Envelope<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; hint?: string; [k: string]: unknown };

export function ok<T>(data: T): Envelope<T> {
  return { ok: true, data };
}

export function fail(error: string, extra?: Record<string, unknown>): Envelope<never> {
  return { ...(extra ?? {}), ok: false, error } as Envelope<never>;
}

export function toMcpContent(env: Envelope): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(env) }],
    ...(env.ok ? {} : { isError: true }),
  };
}
