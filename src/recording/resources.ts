// src/recording/resources.ts
import type { SessionHistory } from '../types/recording';
import { generateCode } from './code-generator';
import { getSessionHistory } from './step-recorder';
import { getBrowser } from '../tools/browser.tool';

function getCurrentSessionId(): string | null {
  return (getBrowser as any).__state?.currentSession ?? null;
}

export function buildSessionsIndex(): string {
  const histories = getSessionHistory();
  if (histories.size === 0) return 'No sessions recorded.';

  const currentId = getCurrentSessionId();
  const lines = [`Sessions (${histories.size} total):\n`];
  for (const [id, h] of histories) {
    const ended = h.endedAt ?? '-';
    const current = id === currentId ? '  [current]' : '';
    lines.push(`- ${id}  ${h.type}  started: ${h.startedAt}  ended: ${ended}  ${h.steps.length} steps${current}`);
  }
  return lines.join('\n');
}

export function buildCurrentSessionSteps(): string {
  const currentId = getCurrentSessionId();
  if (!currentId) return 'No active session.';
  return buildSessionStepsById(currentId);
}

export function buildSessionStepsById(sessionId: string): string {
  const history = getSessionHistory().get(sessionId);
  if (!history) return `Session not found: ${sessionId}`;
  return formatSessionSteps(history);
}

function formatSessionSteps(history: SessionHistory): string {
  const header = `Session: ${history.sessionId} (${history.type}) — ${history.steps.length} steps\n`;

  const stepLines = history.steps.map((step) => {
    if (step.tool === '__session_transition__') {
      return `--- session transitioned to ${step.params.newSessionId ?? 'unknown'} at ${step.timestamp} ---`;
    }
    const statusLabel = step.status === 'ok' ? '[ok]   ' : '[error]';
    const params = Object.entries(step.params)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    const errorSuffix = step.error ? ` — ${step.error}` : '';
    return `${step.index}. ${statusLabel}  ${step.tool.padEnd(24)} ${params}${errorSuffix}  ${step.durationMs}ms`;
  });

  const stepsText = stepLines.length > 0 ? stepLines.join('\n') : '(no steps yet)';
  const jsCode = generateCode(history);
  return `${header}\nSteps:\n${stepsText}\n\n--- Generated WebdriverIO JS ---\n${jsCode}`;
}
