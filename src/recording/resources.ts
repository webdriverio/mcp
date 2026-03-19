// src/recording/resources.ts
import type { SessionHistory } from '../types/recording';
import { generateCode } from './code-generator';
import { getSessionHistory } from './step-recorder';
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
