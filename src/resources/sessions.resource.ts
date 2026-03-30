import type { ResourceDefinition } from '../types/resource';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionHistory } from '../types/recording';
import { generateCode } from '../recording/code-generator';
import { getSessionHistory } from '../recording/step-recorder';
import { getState } from '../session/state';

function getCurrentSessionId(): string | null {
  return getState().currentSession;
}

export interface SessionStepsPayload {
  stepsJson: string;
  generatedJs: string;
}

export function buildSessionsIndex(): string {
  const histories = getSessionHistory();
  const currentId = getCurrentSessionId();
  const sessions = Array.from(histories.values()).map((h) => ({
    sessionId: h.sessionId,
    type: h.type,
    startedAt: h.startedAt,
    ...(h.endedAt ? { endedAt: h.endedAt } : {}),
    stepCount: h.steps.length,
    isCurrent: h.sessionId === currentId,
  }));
  return JSON.stringify({ sessions });
}

export function buildCurrentSessionSteps(): SessionStepsPayload | null {
  const currentId = getCurrentSessionId();
  if (!currentId) return null;

  return buildSessionStepsById(currentId);
}

export function buildSessionStepsById(sessionId: string): SessionStepsPayload | null {
  const history = getSessionHistory().get(sessionId);
  if (!history) return null;

  return buildSessionPayload(history);
}

function buildSessionPayload(history: SessionHistory): SessionStepsPayload {
  const stepsJson = JSON.stringify({
    sessionId: history.sessionId,
    type: history.type,
    startedAt: history.startedAt,
    ...(history.endedAt ? { endedAt: history.endedAt } : {}),
    stepCount: history.steps.length,
    steps: history.steps,
  });

  return { stepsJson, generatedJs: generateCode(history) };
}

export const sessionsIndexResource: ResourceDefinition = {
  name: 'sessions',
  uri: 'wdio://sessions',
  description: 'JSON index of all browser and app sessions with metadata and step counts',
  handler: async () => ({
    contents: [{ uri: 'wdio://sessions', mimeType: 'application/json', text: buildSessionsIndex() }],
  }),
};

export const sessionCurrentStepsResource: ResourceDefinition = {
  name: 'session-current-steps',
  uri: 'wdio://session/current/steps',
  description: 'JSON step log for the currently active session',
  handler: async () => {
    const payload = buildCurrentSessionSteps();
    return {
      contents: [{
        uri: 'wdio://session/current/steps',
        mimeType: 'application/json',
        text: payload?.stepsJson ?? '{"error":"No active session"}',
      }],
    };
  },
};

export const sessionCurrentCodeResource: ResourceDefinition = {
  name: 'session-current-code',
  uri: 'wdio://session/current/code',
  description: 'Generated WebdriverIO JS code for the currently active session',
  handler: async () => {
    const payload = buildCurrentSessionSteps();
    return {
      contents: [{
        uri: 'wdio://session/current/code',
        mimeType: 'text/plain',
        text: payload?.generatedJs ?? '// No active session',
      }],
    };
  },
};

export const sessionStepsResource: ResourceDefinition = {
  name: 'session-steps',
  template: new ResourceTemplate('wdio://session/{sessionId}/steps', { list: undefined }),
  description: 'JSON step log for a specific session by ID',
  handler: async (uri, { sessionId }) => {
    const payload = buildSessionStepsById(sessionId as string);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: payload?.stepsJson ?? `{"error":"Session not found: ${sessionId}"}`,
      }],
    };
  },
};

export const sessionCodeResource: ResourceDefinition = {
  name: 'session-code',
  template: new ResourceTemplate('wdio://session/{sessionId}/code', { list: undefined }),
  description: 'Generated WebdriverIO JS code for a specific session by ID',
  handler: async (uri, { sessionId }) => {
    const payload = buildSessionStepsById(sessionId as string);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/plain',
        text: payload?.generatedJs ?? `// Session not found: ${sessionId}`,
      }],
    };
  },
};