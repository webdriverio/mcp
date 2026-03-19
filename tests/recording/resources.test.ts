// tests/recording/resources.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { getState } from '../../src/session/state';
import type { SessionHistory } from '../../src/types/recording';
import { buildSessionsIndex, buildCurrentSessionSteps, buildSessionStepsById } from '../../src/recording/resources';

function addHistory(sessionId: string, type: 'browser' | 'ios' | 'android', isCurrent = false, ended = false) {
  const state = getState();
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
    state.browsers.set(sessionId, {} as WebdriverIO.Browser);
  }
  return history;
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('buildSessionsIndex', () => {
  it('returns valid JSON with empty sessions array when no sessions', () => {
    const parsed = JSON.parse(buildSessionsIndex());
    expect(parsed.sessions).toEqual([]);
  });

  it('lists all sessions with id, type, stepCount', () => {
    addHistory('abc-1', 'browser', false, true);
    addHistory('def-2', 'ios');
    const parsed = JSON.parse(buildSessionsIndex());
    expect(parsed.sessions).toHaveLength(2);
    const ids = parsed.sessions.map((s: any) => s.sessionId);
    expect(ids).toContain('abc-1');
    expect(ids).toContain('def-2');
  });

  it('marks the current session with isCurrent: true', () => {
    addHistory('cur-1', 'browser', true);
    addHistory('old-1', 'browser', false, true);
    const parsed = JSON.parse(buildSessionsIndex());
    const current = parsed.sessions.filter((s: any) => s.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].sessionId).toBe('cur-1');
  });

  it('includes stepCount per session', () => {
    const h = addHistory('sess-steps', 'browser');
    h.steps.push({ index: 1, tool: 'navigate', params: {}, status: 'ok', durationMs: 10, timestamp: '' });
    h.steps.push({ index: 2, tool: 'click_element', params: {}, status: 'ok', durationMs: 5, timestamp: '' });
    const parsed = JSON.parse(buildSessionsIndex());
    expect(parsed.sessions[0].stepCount).toBe(2);
  });
});

describe('buildCurrentSessionSteps', () => {
  it('returns null when no current session', () => {
    expect(buildCurrentSessionSteps()).toBeNull();
  });

  it('returns stepsJson and generatedJs for the current session', () => {
    const h = addHistory('live-1', 'browser', true);
    h.steps.push({ index: 1, tool: 'navigate', params: { url: 'https://x.com' }, status: 'ok', durationMs: 50, timestamp: '2026-01-01T00:00:00.000Z' });
    const result = buildCurrentSessionSteps();
    expect(result).not.toBeNull();
    expect(result!.stepsJson).toBeDefined();
    expect(result!.generatedJs).toBeDefined();
  });
});

describe('buildSessionStepsById', () => {
  it('returns null for unknown sessionId', () => {
    expect(buildSessionStepsById('nonexistent')).toBeNull();
  });

  it('stepsJson is valid JSON with session metadata and steps array', () => {
    const h = addHistory('hist-1', 'ios');
    h.steps.push({ index: 1, tool: 'tap_element', params: { selector: '~btn' }, status: 'ok', durationMs: 20, timestamp: '2026-01-01T00:00:00.000Z' });
    const result = buildSessionStepsById('hist-1');
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.stepsJson);
    expect(parsed.sessionId).toBe('hist-1');
    expect(parsed.type).toBe('ios');
    expect(parsed.startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.stepCount).toBe(1);
    expect(Array.isArray(parsed.steps)).toBe(true);
    expect(parsed.steps[0]).toMatchObject({
      index: 1,
      tool: 'tap_element',
      params: { selector: '~btn' },
      status: 'ok',
      durationMs: 20,
    });
  });

  it('generatedJs contains valid WebdriverIO code', () => {
    const h = addHistory('hist-2', 'browser');
    h.steps.push({ index: 1, tool: 'navigate', params: { url: 'https://example.com' }, status: 'ok', durationMs: 10, timestamp: '2026-01-01T00:00:00.000Z' });
    const result = buildSessionStepsById('hist-2');
    expect(result!.generatedJs).toContain("await browser.url('https://example.com');");
    expect(result!.generatedJs).toContain("import { remote } from 'webdriverio';");
  });

  it('error steps appear in stepsJson with status and error fields', () => {
    const h = addHistory('err-1', 'browser');
    h.steps.push({ index: 1, tool: 'click_element', params: { selector: '#x' }, status: 'error', error: 'Not found', durationMs: 5, timestamp: '2026-01-01T00:00:00.000Z' });
    const result = buildSessionStepsById('err-1');
    const parsed = JSON.parse(result!.stepsJson);
    expect(parsed.steps[0].status).toBe('error');
    expect(parsed.steps[0].error).toBe('Not found');
  });

  it('stepsJson includes endedAt when session has ended', () => {
    addHistory('ended-1', 'browser', false, true);
    const result = buildSessionStepsById('ended-1');
    const parsed = JSON.parse(result!.stepsJson);
    expect(parsed.endedAt).toBe('2026-01-01T01:00:00.000Z');
  });
});
