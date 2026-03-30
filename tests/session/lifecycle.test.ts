import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMetadata } from '../../src/session/state';
import { getState } from '../../src/session/state';
import { closeSession, registerSession } from '../../src/session/lifecycle';
import type { SessionHistory } from '../../src/types/recording';
import type { SessionResult } from '../../src/providers/types';

// Mock the provider registry so lifecycle tests don't depend on real providers
const mockOnSessionClose = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/providers/registry', () => ({
  getProvider: vi.fn(() => ({ onSessionClose: mockOnSessionClose })),
}));

function makeBrowser(overrides: Record<string, unknown> = {}) {
  return { deleteSession: vi.fn().mockResolvedValue(undefined), ...overrides } as unknown as WebdriverIO.Browser;
}

function makeTunnel(overrides: Partial<{ stop: ReturnType<typeof vi.fn> }> = {}) {
  return {
    stop: vi.fn((cb: () => void) => cb()),
    ...overrides,
  };
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
  mockOnSessionClose.mockReset();
  mockOnSessionClose.mockResolvedValue(undefined);
});

describe('registerSession', () => {
  it('sets currentSession', () => {
    const browser = makeBrowser();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false };
    const history: SessionHistory = {
      sessionId: 's1',
      type: 'browser',
      startedAt: new Date().toISOString(),
      capabilities: {},
      steps: []
    };
    registerSession('s1', browser, meta, history);
    expect(getState().currentSession).toBe('s1');
  });

  it('calls onSessionClose for the orphaned previous session', async () => {
    const state = getState();
    const tunnel = makeTunnel();
    const oldMeta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false, provider: 'browserstack', tunnelHandle: tunnel };
    const h1: SessionHistory = { sessionId: 's1', type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] };
    state.browsers.set('s1', makeBrowser());
    state.sessionMetadata.set('s1', oldMeta);
    state.sessionHistory.set('s1', h1);
    state.currentSession = 's1';

    const newMeta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false };
    const h2: SessionHistory = { sessionId: 's2', type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] };
    registerSession('s2', makeBrowser(), newMeta, h2);

    // Allow fire-and-forget to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockOnSessionClose).toHaveBeenCalledWith('s1', 'browser', { status: 'passed' }, tunnel);
  });

  it('appends session_transition to previous session', () => {
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false };
    const h1: SessionHistory = {
      sessionId: 's1',
      type: 'browser',
      startedAt: new Date().toISOString(),
      capabilities: {},
      steps: []
    };
    state.browsers.set('s1', makeBrowser());
    state.sessionMetadata.set('s1', meta);
    state.sessionHistory.set('s1', h1);
    state.currentSession = 's1';

    const h2: SessionHistory = {
      sessionId: 's2',
      type: 'browser',
      startedAt: new Date().toISOString(),
      capabilities: {},
      steps: []
    };
    registerSession('s2', makeBrowser(), meta, h2);

    expect(h1.steps.length).toBe(1);
    expect(h1.steps[0].tool).toBe('__session_transition__');
    expect(h1.endedAt).toBeDefined();
    expect(getState().currentSession).toBe('s2');
  });
});

describe('closeSession', () => {
  it('calls deleteSession when not detached and not attached', async () => {
    const browser = makeBrowser();
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false };
    const h: SessionHistory = {
      sessionId: 's1',
      type: 'browser',
      startedAt: new Date().toISOString(),
      capabilities: {},
      steps: []
    };
    state.browsers.set('s1', browser);
    state.sessionMetadata.set('s1', meta);
    state.sessionHistory.set('s1', h);
    state.currentSession = 's1';

    await closeSession('s1', false, false);
    expect(browser.deleteSession).toHaveBeenCalled();
    expect(state.currentSession).toBeNull();
  });

  it('skips deleteSession when detach=true', async () => {
    const browser = makeBrowser();
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false };
    const h: SessionHistory = {
      sessionId: 's1',
      type: 'browser',
      startedAt: new Date().toISOString(),
      capabilities: {},
      steps: []
    };
    state.browsers.set('s1', browser);
    state.sessionMetadata.set('s1', meta);
    state.sessionHistory.set('s1', h);
    state.currentSession = 's1';

    await closeSession('s1', true, false);
    expect(browser.deleteSession).not.toHaveBeenCalled();
  });

  it('calls onSessionClose when provider is set on normal close', async () => {
    const browser = makeBrowser();
    const tunnel = makeTunnel();
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false, provider: 'browserstack', tunnelHandle: tunnel };
    const h: SessionHistory = { sessionId: 's1', type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] };
    state.browsers.set('s1', browser);
    state.sessionMetadata.set('s1', meta);
    state.sessionHistory.set('s1', h);
    state.currentSession = 's1';

    await closeSession('s1', false, false);

    expect(mockOnSessionClose).toHaveBeenCalledWith('s1', 'browser', { status: 'passed' }, tunnel);
    expect(browser.deleteSession).toHaveBeenCalled();
  });

  it('calls onSessionClose before deleteSession', async () => {
    const callOrder: string[] = [];
    const browser = makeBrowser();
    (browser.deleteSession as ReturnType<typeof vi.fn>).mockImplementation(async () => { callOrder.push('deleteSession'); });
    mockOnSessionClose.mockImplementation(async (_id: string, _type: string, _result: SessionResult) => { callOrder.push('onSessionClose'); });
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false, provider: 'browserstack' };
    const h: SessionHistory = { sessionId: 's2', type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] };
    state.browsers.set('s2', browser);
    state.sessionMetadata.set('s2', meta);
    state.sessionHistory.set('s2', h);
    state.currentSession = 's2';

    await closeSession('s2', false, false);

    expect(callOrder).toEqual(['onSessionClose', 'deleteSession']);
  });

  it('still closes the session when onSessionClose fails', async () => {
    const browser = makeBrowser();
    mockOnSessionClose.mockRejectedValue(new Error('close failed'));
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false, provider: 'browserstack' };
    const h: SessionHistory = { sessionId: 's3', type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] };
    state.browsers.set('s3', browser);
    state.sessionMetadata.set('s3', meta);
    state.sessionHistory.set('s3', h);
    state.currentSession = 's3';

    await closeSession('s3', false, false);

    expect(browser.deleteSession).toHaveBeenCalled();
    expect(state.currentSession).toBeNull();
  });

  it('does not call onSessionClose when detach=true', async () => {
    const browser = makeBrowser();
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false, provider: 'browserstack' };
    const h: SessionHistory = { sessionId: 's4', type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] };
    state.browsers.set('s4', browser);
    state.sessionMetadata.set('s4', meta);
    state.sessionHistory.set('s4', h);
    state.currentSession = 's4';

    await closeSession('s4', true, false);

    expect(mockOnSessionClose).not.toHaveBeenCalled();
  });

  it('passes failed status when session has error steps', async () => {
    const browser = makeBrowser();
    const state = getState();
    const meta: SessionMetadata = { type: 'browser', capabilities: {}, isAttached: false, provider: 'browserstack' };
    const h: SessionHistory = {
      sessionId: 's5', type: 'browser', startedAt: new Date().toISOString(), capabilities: {},
      steps: [{ index: 1, tool: 'navigate', params: {}, status: 'error', error: 'page not found', durationMs: 0, timestamp: new Date().toISOString() }]
    };
    state.browsers.set('s5', browser);
    state.sessionMetadata.set('s5', meta);
    state.sessionHistory.set('s5', h);
    state.currentSession = 's5';

    await closeSession('s5', false, false);

    expect(mockOnSessionClose).toHaveBeenCalledWith('s5', 'browser', { status: 'failed', reason: 'page not found' }, undefined);
  });
});
