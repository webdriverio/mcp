import type { SessionHistory } from '../types/recording';
import type { ToolGroup, ToolPlatform } from '../toolsets';

export interface SessionMetadata {
  type: 'browser' | 'ios' | 'android';
  /** Browser sessions can have a specialised lifecycle while retaining renderer semantics. */
  runtime?: 'webdriver' | 'electron';
  /** Normalized URI scheme explicitly allowed for Electron deeplink dispatch. */
  electronDeeplinkScheme?: string;
  capabilities: Record<string, unknown>;
  isAttached: boolean;
  provider?: 'local' | 'browserstack' | 'saucelabs' | 'testmu' | 'testingbot' | 'digitalai' | 'external';
  region?: string;
  tunnelName?: string;
  tunnelHandle?: unknown;
  trace?: boolean;
  /** The remote session lifecycle is owned outside this MCP process. */
  externallyManaged?: boolean;
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

type SessionListener = (metadata: SessionMetadata) => void;
const sessionListeners = new Set<SessionListener>();

/** Called whenever a session becomes the active one, e.g. to show the tools for its platform. */
export function onSessionRegistered(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function notifySessionRegistered(metadata: SessionMetadata): void {
  for (const listener of sessionListeners) listener(metadata);
}

export interface ToolSettings {
  platform?: ToolPlatform;
  enabledGroups: Set<ToolGroup>;
}

// shared by every server of the process: HTTP mode builds a new server per request
const toolSettings: ToolSettings = { enabledGroups: new Set() };

export function platformOf(metadata: SessionMetadata): ToolPlatform {
  return metadata.runtime === 'electron' ? 'electron' : metadata.type;
}

/** the platform falls back to the active session when no registration was seen yet */
export function getToolSettings(): ToolSettings {
  if (toolSettings.platform === undefined && state.currentSession) {
    const metadata = state.sessionMetadata.get(state.currentSession);
    if (metadata) toolSettings.platform = platformOf(metadata);
  }
  return toolSettings;
}

export function getState() {
  return state;
}
