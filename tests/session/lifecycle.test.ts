import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMetadata } from '../../src/session/state';
import { getState } from '../../src/session/state';
import { closeSession, registerSession } from '../../src/session/lifecycle';
import type { SessionHistory } from '../../src/types/recording';

function makeBrowser(overrides: Record<string, unknown> = {}) {
  return { deleteSession: vi.fn(), ...overrides } as unknown as WebdriverIO.Browser;
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
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
});
