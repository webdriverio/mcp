import type { SessionHistory } from '../types/recording';
import type { SessionResult } from '../providers/types';
import type { NetworkEntry, SessionMetadata } from './state';
import { getState } from './state';
import { getProvider } from '../providers/registry';

function headersToRecord(headers: Array<{ name: string; value: string }>): Record<string, string> {
  return Object.fromEntries(headers.map(({ name, value }) => [name, value]));
}

async function attachNetworkListener(sessionId: string, browser: WebdriverIO.Browser): Promise<void> {
  if (!browser.isBidi) return;

  const state = getState();
  const log = new Map<string, NetworkEntry>();
  state.sessionNetworkLog.set(sessionId, log);

  try {
    await browser.sessionSubscribe({
      events: ['network.beforeRequestSent', 'network.responseCompleted', 'network.fetchError'],
    });
  } catch {
    return;
  }

  browser.on('network.beforeRequestSent', (params: any) => {
    const entry: NetworkEntry = {
      requestId: params.request.request,
      url: params.request.url,
      method: params.request.method,
      requestHeaders: headersToRecord(params.request.headers ?? []),
      requestTimestamp: params.timestamp,
    };
    log.set(entry.requestId, entry);
  });

  browser.on('network.responseCompleted', (params: any) => {
    const entry = log.get(params.request.request);
    if (!entry) return;
    entry.status = params.response.status;
    entry.responseHeaders = headersToRecord(params.response.headers ?? []);
    entry.responseTimestamp = params.timestamp;
    entry.durationMs = params.timestamp - entry.requestTimestamp;
  });

  browser.on('network.fetchError', (params: any) => {
    const entry = log.get(params.request.request);
    if (!entry) return;
    entry.error = params.errorText;
    entry.responseTimestamp = params.timestamp;
    entry.durationMs = params.timestamp - entry.requestTimestamp;
  });
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

  if (metadata.type === 'browser') {
    void attachNetworkListener(sessionId, browser);
  }

  // If there was a previous session, terminate it to prevent orphaning
  if (oldSessionId && oldSessionId !== sessionId) {
    const oldBrowser = state.browsers.get(oldSessionId);
    const oldMetadata = state.sessionMetadata.get(oldSessionId);
    if (oldBrowser) {
      // Fire and forget — don't block registration on close
      void (async () => {
        if (oldMetadata?.provider) {
          const oldHistory = state.sessionHistory.get(oldSessionId);
          const provider = getProvider(oldMetadata.provider, oldMetadata.type);
          await provider.onSessionClose?.(oldSessionId, oldMetadata.type, getSessionResult(oldHistory), oldMetadata.tunnelHandle).catch(() => {});
        }
        await oldBrowser.deleteSession().catch(() => {
          // Ignore errors during force-close of orphaned session
        });
      })();
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

  const metadata = state.sessionMetadata.get(sessionId);

  // Terminate the WebDriver session if:
  // - force is true (override), OR
  // - detach is false AND isAttached is false (normal close)
  if (force || (!detach && !isAttached)) {
    if (metadata?.provider) {
      try {
        const provider = getProvider(metadata.provider, metadata.type);
        await provider.onSessionClose?.(sessionId, metadata.type, getSessionResult(history), metadata.tunnelHandle);
      } catch (e) {
        console.error('[WARN] Failed to run provider onSessionClose:', e);
      }
    }
    await browser.deleteSession();
  }

  state.browsers.delete(sessionId);
  state.sessionMetadata.delete(sessionId);
  state.sessionNetworkLog.delete(sessionId);

  // Only clear currentSession if it matches the session being closed
  if (state.currentSession === sessionId) {
    state.currentSession = null;
  }
}
