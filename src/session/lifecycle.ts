import type { SessionHistory } from '../types/recording';
import type { SessionResult } from '../providers/types';
import type { SessionMetadata } from './state';
import { getState } from './state';
import { getProvider } from '../providers/registry';
import { finishDevtoolsTrace } from './devtools-trace';
import { clearRefs } from './element-refs';
import { cleanupSessionRuntime } from '../electron/runtime.js';

async function finalizeTrace(sessionId: string): Promise<void> {
  const metadata = getState().sessionMetadata.get(sessionId);
  const handle = metadata?.traceHandle;
  if (!handle) return;
  await finishDevtoolsTrace(handle);
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
): void {
  const state = getState();
  const oldSessionId = state.currentSession;
  if (oldSessionId && oldSessionId !== sessionId) {
    handleSessionTransition(sessionId);
  }
  state.browsers.set(sessionId, browser);
  state.sessionMetadata.set(sessionId, metadata);
  state.sessionHistory.set(sessionId, historyEntry);
  state.currentSession = sessionId;

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
            await finalizeTrace(oldSessionId);
          } catch (e) {
            console.error('[WARN] Failed to finalize orphaned session trace:', e);
          }
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
            // Continue to tunnel teardown. The state entry is removed below,
            // so this is the last opportunity to release an auto-managed tunnel.
          }
        }
        if (oldMetadata?.provider && oldMetadata?.tunnelHandle && !oldMetadata.externallyManaged) {
          const provider = getProvider(oldMetadata.provider, oldMetadata.type);
          await provider.stopTunnel?.(oldMetadata.tunnelHandle).catch(() => {});
        }
      };
      void closeOld();
      state.browsers.delete(oldSessionId);
      state.sessionMetadata.delete(oldSessionId);
      clearRefs(oldSessionId);
    }
  }
}

export async function closeSession(sessionId: string, detach: boolean, isAttached: boolean, force?: boolean): Promise<void> {
  const state = getState();
  const browser = state.browsers.get(sessionId);
  if (!browser) return;

  const history = state.sessionHistory.get(sessionId);
  if (history) {
    history.endedAt = new Date().toISOString();
  }

  const metadata = state.sessionMetadata.get(sessionId);

  if (metadata?.trace) {
    await finalizeTrace(sessionId);
  }

  // Terminate the WebDriver session if:
  // - force is true (override), OR
  // - detach is false AND isAttached is false (normal close)
  try {
    if (force || (!detach && !isAttached)) {
      if (metadata?.provider) {
        try {
          const provider = getProvider(metadata.provider, metadata.type);
          await provider.onSessionClose?.(sessionId, metadata.type, getSessionResult(history), metadata.tunnelHandle, browser, metadata.region);
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
        await browser.deleteSession();
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
    }
  } finally {
    state.browsers.delete(sessionId);
    state.sessionMetadata.delete(sessionId);
    clearRefs(sessionId);

    // Only clear currentSession if it matches the session being closed
    if (state.currentSession === sessionId) {
      state.currentSession = null;
    }
  }
}
