import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionHistory } from '../types/recording';
import type { SessionResult } from '../providers/types';
import type { SessionMetadata } from './state';
import { getState, notifySessionsChanged } from './state';
import { assertNameAvailable, setContextSession } from './routing';
import { getProvider } from '../providers/registry';
import { captureTraceScreenshot, endTrace } from '../trace/recorder.js';
import { deleteTraceSession, getTraceSession } from '../trace/state.js';
import { buildTraceZip } from '../trace/zip-writer.js';
import { cleanupSessionRuntime } from '../electron/runtime.js';
import { releaseSessionMocks } from '../tools/mock.tool.js';
import { withTimeout } from '../utils/with-timeout';
import { killDriverGroup } from './driver-group';

// A hung driver must not block close_session (it skips the per-session queue and its 90s deadline); state cleanup in the outer finally still runs.
const DELETE_SESSION_TIMEOUT_MS = 90_000;

async function finalizeTrace(sessionId: string, browser: WebdriverIO.Browser): Promise<void> {
  endTrace(sessionId);
  captureTraceScreenshot(sessionId, browser);
  const traceSession = getTraceSession(sessionId);
  if (!traceSession) return;
  try {
    await traceSession.screenshotChain;
    const traceDir = join(process.cwd(), '.trace');
    mkdirSync(traceDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = join(traceDir, `${timestamp}-${sessionId.slice(0, 8)}.zip`);
    const zipBuffer = await buildTraceZip(traceSession);
    writeFileSync(outPath, zipBuffer);
    console.error(`[TRACE] Saved to ${outPath}`);
  } catch (e) {
    console.error('[TRACE] Failed to save trace:', e);
  } finally {
    deleteTraceSession(sessionId);
  }
}

function getSessionResult(history: SessionHistory | undefined): SessionResult {
  const errorStep = history?.steps.find(s => s.status === 'error');
  return errorStep
    ? { status: 'failed', reason: errorStep.error }
    : { status: 'passed' };
}

export function handleSessionTransition(newSessionId: string): void {
  const state = getState();
  if (state.currentSession && state.currentSession !== newSessionId) {
    const outgoing = state.sessionHistory.get(state.currentSession);
    if (outgoing) {
      outgoing.steps.push({
        index: outgoing.steps.length + 1,
        tool: '__session_transition__',
        params: { newSessionId },
        status: 'ok',
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
      outgoing.endedAt = new Date().toISOString();
    }
  }
}

export function registerSession(
  sessionId: string,
  browser: WebdriverIO.Browser,
  metadata: SessionMetadata,
  historyEntry: SessionHistory,
  options: { keep?: boolean; name?: string } = {},
): void {
  const state = getState();
  const { keep, name } = options;
  const oldSessionId = keep ? null : state.currentSession;
  assertNameAvailable(name, oldSessionId);
  metadata.name = name ?? metadata.name;
  if (oldSessionId && oldSessionId !== sessionId) {
    handleSessionTransition(sessionId);
  }
  state.browsers.set(sessionId, browser);
  state.sessionMetadata.set(sessionId, metadata);
  state.sessionHistory.set(sessionId, historyEntry);
  if (!keep || !state.currentSession) state.currentSession = sessionId;
  setContextSession(sessionId);

  // If there was a previous session, terminate it to prevent orphaning
  if (oldSessionId && oldSessionId !== sessionId) {
    const oldBrowser = state.browsers.get(oldSessionId);
    const oldMetadata = state.sessionMetadata.get(oldSessionId);
    if (oldBrowser) {
      // Electron replacement teardown is performed by startElectronSession
      // before it starts the next standalone service. Registration itself stays
      // synchronous and orphan cleanup remains non-blocking.
      const closeOld = async () => {
        if (oldMetadata?.trace) {
          try {
            await finalizeTrace(oldSessionId, oldBrowser);
          } catch (e) {
            console.error('[WARN] Failed to finalize orphaned session trace:', e);
          }
        }
        if (oldMetadata?.isAttached || oldMetadata?.externallyManaged) {
          // The dropped browser object is the only handle on its mocks; release them before losing it.
          await releaseSessionMocks(oldBrowser).catch(() => {});
        }
        if (oldMetadata?.provider && !oldMetadata.externallyManaged) {
          const oldHistory = state.sessionHistory.get(oldSessionId);
          const provider = getProvider(oldMetadata.provider, oldMetadata.type);
          await provider.onSessionClose?.(oldSessionId, oldMetadata.type, getSessionResult(oldHistory), oldMetadata.tunnelHandle, oldBrowser, oldMetadata.region).catch(() => {});
        }
        if (!oldMetadata?.isAttached && !oldMetadata?.externallyManaged) {
          await cleanupSessionRuntime(oldMetadata?.runtime, oldBrowser).catch(() => {});
          try {
            await oldBrowser.deleteSession();
          } catch {
            killDriverGroup(oldMetadata?.driverPid);
            // Continue to tunnel teardown. The state entry is removed below,
            // so this is the last opportunity to release an auto-managed tunnel.
          }
        }
        if (oldMetadata?.provider && oldMetadata?.tunnelHandle && !oldMetadata.externallyManaged) {
          const provider = getProvider(oldMetadata.provider, oldMetadata.type);
          await provider.stopTunnel?.(oldMetadata.tunnelHandle).catch(() => {});
        }
      };
      void closeOld().catch((e) => {
        console.error('[WARN] Failed to close replaced session:', e);
      });
      state.browsers.delete(oldSessionId);
      state.sessionMetadata.delete(oldSessionId);
    }
  }
  notifySessionsChanged(metadata);
}

const closing = new Map<string, Promise<void>>();

// close_session bypasses the per-session queue, so overlapping closes must share one teardown.
export function closeSession(sessionId: string, detach: boolean, isAttached: boolean, force?: boolean, result?: SessionResult): Promise<void> {
  const inFlight = closing.get(sessionId);
  if (inFlight) return inFlight;
  const teardown = closeSessionOnce(sessionId, detach, isAttached, force, result).finally(() => closing.delete(sessionId));
  closing.set(sessionId, teardown);
  return teardown;
}

async function closeSessionOnce(sessionId: string, detach: boolean, isAttached: boolean, force?: boolean, result?: SessionResult): Promise<void> {
  const state = getState();
  const browser = state.browsers.get(sessionId);
  if (!browser) return;

  const history = state.sessionHistory.get(sessionId);
  if (history) {
    history.endedAt = new Date().toISOString();
  }

  const metadata = state.sessionMetadata.get(sessionId);

  if (metadata?.trace) {
    await finalizeTrace(sessionId, browser);
  }

  // Terminate the WebDriver session if:
  // - force is true (override), OR
  // - detach is false AND isAttached is false (normal close)
  try {
    if (force || (!detach && !isAttached)) {
      if (metadata?.provider) {
        try {
          const provider = getProvider(metadata.provider, metadata.type);
          await provider.onSessionClose?.(sessionId, metadata.type, result ?? getSessionResult(history), metadata.tunnelHandle, browser, metadata.region);
        } catch (e) {
          console.error('[WARN] Failed to run provider onSessionClose:', e);
        }
      }
      try {
        await cleanupSessionRuntime(metadata?.runtime, browser);
      } catch (e) {
        console.error('[WARN] Failed to clean up session runtime:', e);
      }
      try {
        await withTimeout(browser.deleteSession(), DELETE_SESSION_TIMEOUT_MS, () => new Error(`deleteSession did not finish within ${DELETE_SESSION_TIMEOUT_MS / 1000}s`));
        // the driver has exited, so its pid may be reused before the tunnel stop below finishes
        if (metadata) { metadata.driverPid = undefined; }
      } catch (e) {
        // only on failure: after a clean delete the driver has exited and its pid may already be reused
        killDriverGroup(metadata?.driverPid);
        throw e;
      } finally {
        // Stop tunnel AFTER deleteSession so SC doesn't wait for active jobs.
        // If session deletion fails, still best-effort stop the tunnel so the
        // teardown path does not leak resources.
        if (metadata?.provider && metadata?.tunnelHandle) {
          try {
            const provider = getProvider(metadata.provider, metadata.type);
            await provider.stopTunnel?.(metadata.tunnelHandle);
          } catch (e) {
            console.error('[WARN] Failed to stop tunnel:', e);
          }
        }
      }
    } else {
      // Detached: the external browser outlives MCP, so live interception must not survive the handle drop.
      await releaseSessionMocks(browser).catch(() => {});
    }
  } finally {
    state.browsers.delete(sessionId);
    state.sessionMetadata.delete(sessionId);

    // Only clear currentSession if it matches the session being closed
    if (state.currentSession === sessionId) {
      state.currentSession = null;
    }
    notifySessionsChanged();
  }
}

export function killAllDriverGroups(): void {
  for (const metadata of getState().sessionMetadata.values()) killDriverGroup(metadata.driverPid);
}

/**
 * End every session when the server goes away. Without this, a client that
 * stops the server leaves each local driver and its browser running. Sessions
 * `close_session` would detach from stay running.
 */
export async function closeAllSessions(): Promise<void> {
  const state = getState();
  await Promise.all([...state.browsers.keys()].map(async (sessionId) => {
    const metadata = state.sessionMetadata.get(sessionId);
    const detach = metadata?.externallyManaged === true || metadata?.provider === 'external';
    await closeSession(sessionId, detach, !!metadata?.isAttached).catch((e) => {
      console.error(`[WARN] Failed to close session ${sessionId} on shutdown:`, e);
    });
  }));
}
