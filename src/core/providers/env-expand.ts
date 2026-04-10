export function expandEnv(value: string): string {
  return value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    return process.env[name] ?? "";
  });
}

export function expandRecord(
  record: Record<string, string> | undefined,
): Record<string, string> {
  if (!record) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = expandEnv(value);
  }
  return result;
}
