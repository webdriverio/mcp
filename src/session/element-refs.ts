import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SnapshotElement } from '@wdio/elements';
import { getState } from './state';
import { appendStep } from '../recording/step-recorder';

// ponytail: in-memory per-process ref store; externalize if multi-instance matters
const refs = new Map<string, { generation: number; elements: Record<string, SnapshotElement> }>();

const REF_PARAMS = ['selector', 'sourceSelector', 'targetSelector'] as const;
/** `e12` or `e12@3`; group 2 absent means the caller dropped the generation. */
const REF_PATTERN = /^e(\d+)(?:@(\d+))?$/;
const RESNAPSHOT_HINT = 'call get_snapshot (or re-read wdio://session/current/snapshot)';

function refError(value: string, reason: string): Error {
  return new Error(`Element ref "${value}" ${reason} — ${RESNAPSHOT_HINT}`);
}

// Global, not per-session: sessions are reused by id after close, so a per-session
// counter would mint the same generation twice and let a dead session's ref resolve
// against a live one.
let nextGeneration = 1;

export function storeRefs(sessionId: string, elements: Record<string, SnapshotElement>): number {
  const generation = nextGeneration++;
  refs.set(sessionId, { generation, elements });
  return generation;
}

export function clearRefs(sessionId: string): void {
  refs.delete(sessionId);
}

/**
 * Refs are positional — upstream renumbers `eN` on every snapshot — so a ref read
 * from one snapshot can name a different element in the next. Stamp each ref with
 * the generation that produced it so a cross-snapshot reuse fails loudly instead
 * of silently acting on whatever now sits in that slot.
 */
export function stampRefs(text: string, generation: number): string {
  return text.replace(/^(\s*)e(\d+)(?=\s|$)/gm, `$1e$2@${generation}`);
}

export function resolveRef(value: string): string {
  const match = REF_PATTERN.exec(value.trim());
  if (!match) return value;

  const [, num, generation] = match;
  if (generation === undefined) {
    // An unstamped ref cannot be checked for staleness, so refuse it rather than
    // guess which snapshot the caller meant.
    throw new Error(
      `Element ref "${value}" is missing its snapshot generation — use it exactly as returned by ` +
      'get_snapshot, for example "e1@2"',
    );
  }

  const sessionId = getState().currentSession;
  const current = sessionId ? refs.get(sessionId) : undefined;
  if (!current) throw refError(value, 'is unknown');

  if (Number(generation) !== current.generation) {
    throw refError(value, `is from snapshot ${generation}, but the current snapshot is ${current.generation}`);
  }

  const key = `e${Number(num)}`;
  const element = current.elements[key];
  if (!element) throw refError(value, `is not in snapshot ${current.generation}`);

  return element.qualifiedSelector ?? element.selector;
}

/**
 * Resolves `eN` snapshot refs to real selectors before the wrapped callback runs,
 * so recording, tracing and the tool itself all see a runnable selector.
 */
export function withRefs(name: string, cb: ToolCallback): ToolCallback {
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
      appendStep(name, params as Record<string, unknown>, 'error', 0, e instanceof Error ? e.message : String(e));
      return {
        isError: true,
        content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
      };
    }
  };
}
