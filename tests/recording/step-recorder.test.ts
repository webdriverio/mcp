// tests/recording/step-recorder.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import { getState } from '../../src/session/state';
import type { SessionHistory } from '../../src/types/recording';
import { appendStep, withRecording, getSessionHistory } from '../../src/recording/step-recorder';

const extra = {} as Parameters<ToolCallback>[1];
type AnyToolFn = (params: Record<string, unknown>, extra: unknown) => Promise<unknown>;

function setupSession(sessionId: string) {
  const state = getState();
  state.browsers.set(sessionId, {} as WebdriverIO.Browser);
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, { type: 'browser', capabilities: {}, isAttached: false });
  state.sessionHistory.set(sessionId, {
    sessionId,
    type: 'browser',
    startedAt: '2026-01-01T00:00:00.000Z',
    capabilities: {},
    steps: [],
  } as SessionHistory);
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('appendStep', () => {
  it('appends an ok step to the current session history', () => {
    setupSession('sess-1');
    appendStep('navigate', { url: 'https://example.com' }, 'ok', 42);
    const history = getSessionHistory().get('sess-1');
    expect(history?.steps).toHaveLength(1);
    expect(history?.steps[0]).toMatchObject({
      index: 1,
      tool: 'navigate',
      params: { url: 'https://example.com' },
      status: 'ok',
      durationMs: 42,
    });
    expect(history?.steps[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('appends an error step with the error message', () => {
    setupSession('sess-2');
    appendStep('click_element', { selector: '#btn' }, 'error', 10, 'Element not found');
    const history = getSessionHistory().get('sess-2');
    expect(history?.steps[0]).toMatchObject({
      status: 'error',
      error: 'Element not found',
    });
  });

  it('does nothing when there is no active session', () => {
    // currentSession is null — should not throw
    expect(() => appendStep('navigate', {}, 'ok', 0)).not.toThrow();
  });

  it('assigns sequential 1-based index values', () => {
    setupSession('sess-3');
    appendStep('navigate', { url: 'https://a.com' }, 'ok', 10);
    appendStep('click_element', { selector: '#x' }, 'ok', 5);
    const steps = getSessionHistory().get('sess-3')?.steps ?? [];
    expect(steps[0].index).toBe(1);
    expect(steps[1].index).toBe(2);
  });
});

describe('withRecording', () => {
  it('records a successful tool call as ok', async () => {
    setupSession('sess-4');
    const mockTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Navigated to https://example.com' }],
    }) as unknown as ToolCallback;
    const wrapped = withRecording('navigate', mockTool) as unknown as AnyToolFn;
    await wrapped({ url: 'https://example.com' }, extra);
    const steps = getSessionHistory().get('sess-4')?.steps ?? [];
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('ok');
    expect(steps[0].tool).toBe('navigate');
  });

  it('records a result with isError: true as error regardless of text content', async () => {
    setupSession('sess-5');
    const mockTool = vi.fn().mockResolvedValue({
      isError: true,
      content: [{ type: 'text', text: 'Failed to find element' }],
    }) as unknown as ToolCallback;
    const wrapped = withRecording('click_element', mockTool) as unknown as AnyToolFn;
    await wrapped({ selector: '#missing' }, extra);
    const steps = getSessionHistory().get('sess-5')?.steps ?? [];
    expect(steps[0].status).toBe('error');
    expect(steps[0].error).toBe('Failed to find element');
  });

  it('records a result without isError flag as ok even if text starts with Error:', async () => {
    setupSession('sess-5b');
    const mockTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Error: something went wrong' }],
    }) as unknown as ToolCallback;
    const wrapped = withRecording('click_element', mockTool) as unknown as AnyToolFn;
    await wrapped({ selector: '#btn' }, extra);
    const steps = getSessionHistory().get('sess-5b')?.steps ?? [];
    expect(steps[0].status).toBe('ok');
  });

  it('returns the original tool result unchanged', async () => {
    setupSession('sess-6');
    const expected = { content: [{ type: 'text', text: 'Done' }] };
    const mockTool = vi.fn().mockResolvedValue(expected) as unknown as ToolCallback;
    const wrapped = withRecording('navigate', mockTool) as unknown as AnyToolFn;
    const result = await wrapped({}, extra);
    expect(result).toEqual(expected);
  });

  it('records durationMs as a non-negative number', async () => {
    setupSession('sess-7');
    const mockTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Done' }],
    }) as unknown as ToolCallback;
    const wrapped = withRecording('navigate', mockTool) as unknown as AnyToolFn;
    await wrapped({}, extra);
    const step = getSessionHistory().get('sess-7')?.steps[0];
    expect(typeof step?.durationMs).toBe('number');
    expect(step?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
