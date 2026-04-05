import type { ResourceDefinition } from '../types/resource';
import { getState } from '../session/state';

function buildNetworkLog(): string {
  const state = getState();
  const sessionId = state.currentSession;
  if (!sessionId) return JSON.stringify({ error: 'No active session' });

  const log = state.sessionNetworkLog.get(sessionId);
  if (!log) return JSON.stringify({ error: 'Network log not available for this session type' });

  return JSON.stringify({ sessionId, entries: Array.from(log.values()) });
}

export const networkResource: ResourceDefinition = {
  name: 'session-current-network',
  uri: 'wdio://session/current/network',
  description: 'Network requests/responses for the current session (browser sessions only, paired by requestId)',
  handler: async () => ({
    contents: [{
      uri: 'wdio://session/current/network',
      mimeType: 'application/json',
      text: buildNetworkLog(),
    }],
  }),
};
