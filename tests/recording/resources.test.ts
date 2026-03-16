// tests/recording/resources.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { getBrowser } from '../../src/tools/browser.tool';
import type { SessionHistory } from '../../src/types/recording';
import { buildSessionsIndex, buildCurrentSessionSteps, buildSessionStepsById } from '../../src/recording/resources';

function addHistory(sessionId: string, type: 'browser' | 'ios' | 'android', isCurrent = false, ended = false) {
  const state = (getBrowser as any).__state;
  const history: SessionHistory = {
    sessionId,
    type,
    startedAt: '2026-01-01T00:00:00.000Z',
    ...(ended ? { endedAt: '2026-01-01T01:00:00.000Z' } : {}),
    capabilities: { browserName: 'chrome' },
    steps: [],
  };
  state.sessionHistory.set(sessionId, history);
  if (isCurrent) {
    state.currentSession = sessionId;
    state.browsers.set(sessionId, {});
  }
  return history;
}

beforeEach(() => {
  const state = (getBrowser as any).__state;
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('buildSessionsIndex', () => {
  it('returns "No sessions recorded." when empty', () => {
    expect(buildSessionsIndex()).toBe('No sessions recorded.');
  });

  it('lists all sessions with id, type, step count', () => {
    addHistory('abc-1', 'browser', false, true);
    addHistory('def-2', 'ios');
    const result = buildSessionsIndex();
    expect(result).toContain('abc-1');
    expect(result).toContain('def-2');
    expect(result).toContain('browser');
    expect(result).toContain('ios');
  });

  it('marks current session with [current]', () => {
    addHistory('cur-1', 'browser', true);
    addHistory('old-1', 'browser', false, true);
    const result = buildSessionsIndex();
    expect(result).toContain('[current]');
    // only the current one should be marked
    const lines = result.split('\n').filter((l) => l.includes('[current]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('cur-1');
  });

  it('shows step count per session', () => {
    const h = addHistory('sess-steps', 'browser');
    h.steps.push({ index: 1, tool: 'navigate', params: {}, status: 'ok', durationMs: 10, timestamp: '' });
    h.steps.push({ index: 2, tool: 'click_element', params: {}, status: 'ok', durationMs: 5, timestamp: '' });
    const result = buildSessionsIndex();
    expect(result).toContain('2 steps');
  });
});

describe('buildCurrentSessionSteps', () => {
  it('returns "No active session." when no current session', () => {
    expect(buildCurrentSessionSteps()).toBe('No active session.');
  });

  it('returns step listing and generated JS for current session', () => {
    const h = addHistory('live-1', 'browser', true);
    h.steps.push({ index: 1, tool: 'navigate', params: { url: 'https://x.com' }, status: 'ok', durationMs: 50, timestamp: '2026-01-01T00:00:00.000Z' });
    const result = buildCurrentSessionSteps();
    expect(result).toContain('live-1');
    expect(result).toContain('navigate');
    expect(result).toContain('Generated WebdriverIO JS');
    expect(result).toContain("await browser.url('https://x.com');");
  });
});

describe('buildSessionStepsById', () => {
  it('returns "Session not found" for unknown sessionId', () => {
    expect(buildSessionStepsById('nonexistent')).toBe('Session not found: nonexistent');
  });

  it('returns session steps for known sessionId', () => {
    const h = addHistory('hist-1', 'ios');
    h.steps.push({ index: 1, tool: 'tap_element', params: { selector: '~btn' }, status: 'ok', durationMs: 20, timestamp: '2026-01-01T00:00:00.000Z' });
    const result = buildSessionStepsById('hist-1');
    expect(result).toContain('hist-1');
    expect(result).toContain('tap_element');
    expect(result).toContain('Generated WebdriverIO JS');
  });

  it('marks error steps with [error] in the step list', () => {
    const h = addHistory('err-1', 'browser');
    h.steps.push({ index: 1, tool: 'click_element', params: { selector: '#x' }, status: 'error', error: 'Not found', durationMs: 5, timestamp: '2026-01-01T00:00:00.000Z' });
    const result = buildSessionStepsById('err-1');
    expect(result).toContain('[error]');
    expect(result).toContain('Not found');
  });
});
