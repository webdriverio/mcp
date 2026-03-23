import type { SessionHistory } from '../types/recording';

export interface SessionMetadata {
  type: 'browser' | 'ios' | 'android';
  capabilities: Record<string, unknown>;
  isAttached: boolean;
}

const state = {
  browsers: new Map<string, WebdriverIO.Browser>(),
  currentSession: null as string | null,
  sessionMetadata: new Map<string, SessionMetadata>(),
  sessionHistory: new Map<string, SessionHistory>(),
};

export function getBrowser(): WebdriverIO.Browser {
  const browser = state.browsers.get(state.currentSession);
  if (!browser) {
    throw new Error('No active browser session');
  }
  return browser;
}

export function getState() {
  return state;
}
