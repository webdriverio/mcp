// wdio matches the method filter case-insensitively and treats '' as no filter, so keys and
// driver calls must normalize both or one interception forks into two handles.
export const normalizeBrowserMethod = (method: unknown): string | undefined =>
  typeof method === 'string' && method ? method.toLowerCase() : undefined;

export const respondParams = (
  { statusCode, headers }: { statusCode?: number; headers?: Record<string, string> },
): { statusCode?: number; headers?: Record<string, string> } | undefined => {
  const defined = Object.entries({ statusCode, headers }).filter(([, value]) => value !== undefined);
  return defined.length ? (Object.fromEntries(defined) as { statusCode?: number; headers?: Record<string, string> }) : undefined;
};
