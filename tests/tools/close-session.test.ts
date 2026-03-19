import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionHistory } from '../../src/types/recording';

// No mock of browser.tool — closeSessionTool reads from the module-level state directly.
// We inject test sessions via getState(), which IS the module-level state object.
import { closeSessionTool } from '../../src/tools/browser.tool';
import { getState } from '../../src/session/state';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const callClose = closeSessionTool as unknown as ToolFn;

const mockDeleteSession = vi.fn();

function setupSession(sessionId: string, isAttached: boolean) {
  const state = getState();
  state.browsers.set(sessionId, { deleteSession: mockDeleteSession } as unknown as WebdriverIO.Browser);
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, { type: 'browser', capabilities: {}, isAttached });
  state.sessionHistory.set(sessionId, {
    sessionId,
    type: 'browser',
    startedAt: '2026-01-01T00:00:00.000Z',
    capabilities: {},
    steps: [],
  } as SessionHistory);
}

beforeEach(() => {
  vi.clearAllMocks();
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('close_session', () => {
  it('calls deleteSession when isAttached is false', async () => {
    setupSession('sess-1', false);
    await callClose({});
    expect(mockDeleteSession).toHaveBeenCalledOnce();
  });

  it('skips deleteSession when isAttached is true', async () => {
    setupSession('sess-attached', true);
    await callClose({});
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('returns "detached from" message when isAttached is true and detach is false', async () => {
    setupSession('sess-attached', true);
    const result = await callClose({});
    expect(result.content[0].text).toContain('detached from');
  });

  it('cleans up local state in both cases', async () => {
    setupSession('sess-2', true);
    await callClose({});
    const state = getState();
    expect(state.currentSession).toBeNull();
    expect(state.browsers.has('sess-2')).toBe(false);
  });
});

describe('close_session sessionHistory', () => {
  it('sets endedAt on the session history when session closes', async () => {
    setupSession('sess-history', false);
    await callClose({});
    const state = getState();
    const history = state.sessionHistory.get('sess-history');
    expect(history).toBeDefined();
    expect(history.endedAt).toBeDefined();
    expect(typeof history.endedAt).toBe('string');
  });

  it('retains sessionHistory after session is closed (browsers entry removed)', async () => {
    setupSession('sess-retain', false);
    await callClose({});
    const state = getState();
    expect(state.browsers.has('sess-retain')).toBe(false);
    expect(state.sessionHistory.has('sess-retain')).toBe(true);
  });
});
