// src/recording/step-recorder.ts
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { RecordedStep, SessionHistory } from '../types/recording';
import { getBrowser } from '../tools/browser.tool';

function getState() {
  return (getBrowser as any).__state as {
    currentSession: string | null;
    sessionHistory: Map<string, SessionHistory>;
  };
}

export function appendStep(
  toolName: string,
  params: Record<string, unknown>,
  status: 'ok' | 'error',
  durationMs: number,
  error?: string,
): void {
  const state = getState();
  const sessionId = state.currentSession;
  if (!sessionId) return;

  const history = state.sessionHistory.get(sessionId);
  if (!history) return;

  const step: RecordedStep = {
    index: history.steps.length + 1,
    tool: toolName,
    params,
    status,
    durationMs,
    timestamp: new Date().toISOString(),
    ...(error !== undefined && { error }),
  };
  history.steps.push(step);
}

export function getSessionHistory(): Map<string, SessionHistory> {
  return getState().sessionHistory;
}

function extractErrorText(result: Awaited<ReturnType<ToolCallback>>): string {
  const textContent = result.content.find((c: any) => c.type === 'text');
  return textContent ? (textContent as any).text : 'Unknown error';
}

export function withRecording(toolName: string, callback: ToolCallback): ToolCallback {
  return async (params, extra) => {
    const start = Date.now();
    const result = await callback(params, extra);
    const isError = (result as any).isError === true;
    appendStep(
      toolName,
      params as Record<string, unknown>,
      isError ? 'error' : 'ok',
      Date.now() - start,
      isError ? extractErrorText(result) : undefined,
    );
    return result;
  };
}
