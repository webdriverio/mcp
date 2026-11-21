const clean = (value: unknown) => typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 100) : '';

/** the connecting client as one log line, from the `clientInfo` of its `initialize` request */
export function clientLine(info: unknown): string {
  const { name, version } = (info && typeof info === 'object' ? info : {}) as Record<string, unknown>;
  return `MCP client: ${[clean(name) || 'unknown', clean(version)].filter(Boolean).join(' ')}`;
}

/** `clientInfo` of a JSON-RPC body when it is an `initialize` request */
export function initializeClientInfo(body: unknown): unknown {
  const message = body as { method?: unknown; params?: { clientInfo?: unknown } } | undefined;
  return message?.method === 'initialize' ? message.params?.clientInfo ?? {} : undefined;
}
