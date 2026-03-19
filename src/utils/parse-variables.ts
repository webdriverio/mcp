// Utility to parse URI template variables from MCP resource handlers
export function parseBool(v: string | string[] | undefined, defaultValue: boolean): boolean {
  if (v === undefined) return defaultValue;
  const s = Array.isArray(v) ? v[0] : v;
  return s === 'true' ? true : s === 'false' ? false : defaultValue;
}

export function parseNumber(v: string | string[] | undefined, defaultValue: number): number {
  if (v === undefined) return defaultValue;
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

export function parseStringArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v.flatMap((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
  return v.split(',').map((x) => x.trim()).filter(Boolean);
}
