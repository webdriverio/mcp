import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getState, platformOf } from './state';
import { activeSessionId, sessionContext } from './context';
import type { SessionCallContext } from './context';
import { toolAppliesTo } from '../toolsets';
import { withTimeout } from '../utils/with-timeout';

export { activeSessionId, sessionContext };
export type { SessionCallContext };

const SHORT_ID_LENGTH = 8;

export function liveSessionIds(): string[] {
  return [...getState().browsers.keys()];
}

export function sessionLabel(id: string): string {
  const short = id.slice(0, SHORT_ID_LENGTH);
  const name = getState().sessionMetadata.get(id)?.name;
  return name ? `${name} (${short})` : short;
}

export function resolveSession(target: string): string {
  const state = getState();
  if (state.browsers.has(target)) return target;
  for (const [id, metadata] of state.sessionMetadata) {
    if (metadata.name === target && state.browsers.has(id)) return id;
  }
  const live = liveSessionIds().map(sessionLabel).join(', ') || 'none';
  throw new Error(`Unknown session "${target}". Live sessions: ${live}`);
}

export function setContextSession(id: string): void {
  const store = sessionContext.getStore();
  if (store) store.sessionId = id;
}

const queues = new Map<string, Promise<unknown>>();

export function runInSessionQueue<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(sessionId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => {}).then(() => {
    if (queues.get(sessionId) === tail) queues.delete(sessionId);
  });
  queues.set(sessionId, tail);
  return run;
}

type ToolResult = Awaited<ReturnType<ToolCallback>>;

function errorResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
}

// Outlasts the 30s action timeout in agent.ts so bounded actions report their own; only unblocks the queue, the abandoned WebDriver call keeps running.
export const QUEUED_CALL_TIMEOUT_MS = 90_000;

class QueuedCallTimeout extends Error {}

async function withQueuedCallTimeout<T>(work: Promise<T>, toolName: string): Promise<T> {
  return withTimeout(work, QUEUED_CALL_TIMEOUT_MS, () => new QueuedCallTimeout(
    `"${toolName}" did not finish within ${QUEUED_CALL_TIMEOUT_MS / 1000}s. The session queue moved on; the browser may still be busy with it.`,
  ));
}

export function assertNameAvailable(name: string | undefined, replacingSessionId?: string | null): void {
  if (!name) return;
  const state = getState();
  for (const [id, metadata] of state.sessionMetadata) {
    if (metadata.name === name && id !== replacingSessionId && state.browsers.has(id)) {
      throw new Error(`Session name "${name}" is already in use`);
    }
  }
}

// Session-less tools create their session mid-call; the empty store lets registerSession claim it for the call.
export function withSessionlessContext(cb: ToolCallback): ToolCallback {
  return ((args: unknown, extra: unknown) =>
    sessionContext.run({}, () => (cb as (...x: unknown[]) => Promise<ToolResult>)(args, extra))) as unknown as ToolCallback;
}

export function withSessionTarget(toolName: string, cb: ToolCallback, unqueued = false): ToolCallback {
  return (async (args: Record<string, unknown> | undefined, extra: never) => {
    const { session: target, ...rest } = (args ?? {}) as Record<string, unknown> & { session?: string };
    const call = (...a: unknown[]) => (cb as (...x: unknown[]) => Promise<ToolResult>)(...a);
    const state = getState();
    const prefixNeeded = Boolean(target) || liveSessionIds().length > 1;

    let sessionId: string | null;
    if (target) {
      try {
        sessionId = resolveSession(target);
      } catch (e) {
        return errorResult((e as Error).message);
      }
    } else {
      sessionId = state.currentSession;
      if (!sessionId && liveSessionIds().length > 0) {
        return errorResult(`No default session. Pass session: one of ${liveSessionIds().map(sessionLabel).join(', ')}`);
      }
    }

    if (!sessionId) return sessionContext.run({}, () => call(rest, extra));

    const id = sessionId;
    const metadata = state.sessionMetadata.get(id);
    if (metadata && !toolAppliesTo(toolName, platformOf(metadata))) {
      return errorResult(`Tool "${toolName}" does not apply to ${platformOf(metadata)} session ${sessionLabel(id)}`);
    }

    const run = () => sessionContext.run({ sessionId: id }, () => call(rest, extra));
    let result: ToolResult;
    try {
      result = await (unqueued ? run() : runInSessionQueue(id, () => withQueuedCallTimeout(run(), toolName)));
    } catch (e) {
      if (!(e instanceof QueuedCallTimeout)) throw e;
      result = errorResult(e.message);
    }
    if (!prefixNeeded) return result;
    return {
      ...result,
      content: [{ type: 'text', text: `[session: ${sessionLabel(id)}]` }, ...(result.content ?? [])],
    } as ToolResult;
  }) as unknown as ToolCallback;
}
