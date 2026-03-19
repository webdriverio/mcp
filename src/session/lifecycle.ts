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
  if (state.currentSession && state.currentSession !== sessionId) {
    handleSessionTransition(sessionId);
  }
  state.browsers.set(sessionId, browser);
  state.sessionMetadata.set(sessionId, metadata);
  state.sessionHistory.set(sessionId, historyEntry);
  state.currentSession = sessionId;
}

export async function closeSession(sessionId: string, detach: boolean, isAttached: boolean): Promise<void> {
  const state = getState();
  const browser = state.browsers.get(sessionId);
  if (!browser) return;

  const history = state.sessionHistory.get(sessionId);
  if (history) {
    history.endedAt = new Date().toISOString();
  }

  // Only terminate the WebDriver session if we created it (not attached/borrowed)
  if (!detach && !isAttached) {
    await browser.deleteSession();
  }

  state.browsers.delete(sessionId);
  state.sessionMetadata.delete(sessionId);
  state.currentSession = null;
}
