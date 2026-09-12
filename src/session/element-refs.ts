import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SnapshotElement } from '@wdio/elements';
import { getState } from './state';

// ponytail: in-memory per-process ref store; externalize if multi-instance matters
const refs = new Map<string, Record<string, SnapshotElement>>();

const REF_PARAMS = ['selector', 'sourceSelector', 'targetSelector'] as const;
const REF_PATTERN = /^e\d+$/;

export function storeRefs(sessionId: string, elements: Record<string, SnapshotElement>): void {
  refs.set(sessionId, elements);
}

export function clearRefs(sessionId: string): void {
  refs.delete(sessionId);
}

export function resolveRef(value: string): string {
  if (!REF_PATTERN.test(value)) return value;
  const sessionId = getState().currentSession;
  const element = sessionId ? refs.get(sessionId)?.[value] : undefined;
  if (!element) {
    throw new Error(`Unknown element ref "${value}" — re-run wdio://session/current/snapshot`);
  }
  return element.qualifiedSelector ?? element.selector;
}

/**
 * Resolves `eN` snapshot refs to real selectors before the wrapped callback runs,
 * so recording, tracing and the tool itself all see a runnable selector.
 */
export function withRefs(cb: ToolCallback): ToolCallback {
  const call = cb as unknown as (
    params: Record<string, unknown>,
    extra: unknown,
  ) => ReturnType<ToolCallback>;

  return async (params, extra) => {
    // No session: let the wrapped tool report its own "No active browser session".
    if (!getState().currentSession) return call(params as Record<string, unknown>, extra);

    try {
      const resolved = { ...(params as Record<string, unknown>) };
      for (const key of REF_PARAMS) {
        const value = resolved[key];
        if (typeof value === 'string') {
          resolved[key] = resolveRef(value);
        }
      }
      return await call(resolved, extra);
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
      };
    }
  };
}
