// src/recording/step-recorder.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RecordedStep, SessionHistory } from '../types/recording';
import { getState } from '../session/state';

const recordedCode = new AsyncLocalStorage<string[]>();

/** Attaches code the agent ran to the step of the tool call in progress. */
export function recordCode(code: string | undefined): void {
  if (code) recordedCode.getStore()?.push(code);
}

export function appendStep(
  toolName: string,
  params: Record<string, unknown>,
  status: 'ok' | 'error',
  durationMs: number,
  error?: string,
  code?: string[],
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
    ...(code?.length ? { code } : {}),
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
    const code: string[] = [];
    const result = await recordedCode.run(code, () => callback(params, extra));
    const isError = (result as any).isError === true;
    appendStep(
      toolName,
      params as Record<string, unknown>,
      isError ? 'error' : 'ok',
      Date.now() - start,
      isError ? extractErrorText(result) : undefined,
      code,
    );
    return result;
  };
}
