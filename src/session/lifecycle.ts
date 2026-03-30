import type { SessionHistory } from '../types/recording';
import type { SessionMetadata } from './state';
import { getState } from './state';

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
    if (oldBrowser) {
      // Fire and forget — don't block registration on close
      oldBrowser.deleteSession().catch(() => {
        // Ignore errors during force-close of orphaned session
      });
      state.browsers.delete(oldSessionId);
      state.sessionMetadata.delete(oldSessionId);
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

  // Terminate the WebDriver session if:
  // - force is true (override), OR
  // - detach is false AND isAttached is false (normal close)
  if (force || (!detach && !isAttached)) {
    await browser.deleteSession();
  }

  state.browsers.delete(sessionId);
  state.sessionMetadata.delete(sessionId);

  // Only clear currentSession if it matches the session being closed
  if (state.currentSession === sessionId) {
    state.currentSession = null;
  }
}
