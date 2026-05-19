import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import { getState } from '../../src/session/state';
import { withTrace, recordInitialNavigation } from '../../src/trace/recorder';
import { createTraceSession, getTraceSession } from '../../src/trace/state';

const extra = {} as Parameters<ToolCallback>[1];
type AnyToolFn = (params: Record<string, unknown>, extra: unknown) => Promise<unknown>;

const SUCCESS_RESULT = { content: [{ type: 'text', text: 'ok' }] };
const ERROR_RESULT = { isError: true, content: [{ type: 'text', text: 'something failed' }] };

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function setupTracedSession(sessionId: string) {
  const state = getState();
  const mockBrowser = {
    takeScreenshot: vi.fn().mockResolvedValue(TINY_PNG),
  } as unknown as WebdriverIO.Browser;

  state.browsers.set(sessionId, mockBrowser);
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, { type: 'browser', capabilities: {}, isAttached: false, trace: true });
  state.sessionHistory.set(sessionId, { sessionId, type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] });

  createTraceSession(sessionId, 'chromium', { width: 1280, height: 720 }, 'test');
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('withTrace', () => {
  it('no-ops when tracing is not enabled', async () => {
    const state = getState();
    state.currentSession = 'sess-no-trace';
    state.sessionMetadata.set('sess-no-trace', { type: 'browser', capabilities: {}, isAttached: false, trace: false });

    const tool = vi.fn().mockResolvedValue(SUCCESS_RESULT) as unknown as ToolCallback;
    const wrapped = withTrace('navigate', tool) as AnyToolFn;
    await wrapped({ url: 'https://example.com' }, extra);

    expect(tool).toHaveBeenCalledOnce();
    expect(getTraceSession('sess-no-trace')).toBeUndefined();
  });

  it('no-ops for unmapped tools', async () => {
    const sessionId = 'sess-unmapped';
    setupTracedSession(sessionId);

    const tool = vi.fn().mockResolvedValue(SUCCESS_RESULT) as unknown as ToolCallback;
    const wrapped = withTrace('get_elements', tool) as AnyToolFn;
    await wrapped({}, extra);

    expect(tool).toHaveBeenCalledOnce();
    const session = getTraceSession(sessionId)!;
    // Only context-options event, no before/after
    expect(session.events.filter((e) => e.type === 'before')).toHaveLength(0);
  });

  it('emits before and after events for mapped tools', async () => {
    const sessionId = 'sess-mapped';
    setupTracedSession(sessionId);

    const tool = vi.fn().mockResolvedValue(SUCCESS_RESULT) as unknown as ToolCallback;
    const wrapped = withTrace('navigate', tool) as AnyToolFn;
    await wrapped({ url: 'https://example.com' }, extra);

    const session = getTraceSession(sessionId)!;
    const before = session.events.find((e) => e.type === 'before') as { callId: string; title: string };
    const after = session.events.find((e) => e.type === 'after') as { callId: string; error?: unknown };

    expect(before).toBeDefined();
    expect(before.callId).toBe('call@1');
    expect(before.title).toContain('Page.navigate');
    expect(after).toBeDefined();
    expect(after.callId).toBe('call@1');
    expect(after.error).toBeUndefined();
  });

  it('captures a screenshot and emits screencast-frame on success', async () => {
    const sessionId = 'sess-screenshot';
    setupTracedSession(sessionId);

    const tool = vi.fn().mockResolvedValue(SUCCESS_RESULT) as unknown as ToolCallback;
    await (withTrace('navigate', tool) as AnyToolFn)({ url: 'https://x.com' }, extra);

    const session = getTraceSession(sessionId)!;
    await session.screenshotChain;
    const frame = session.events.find((e) => e.type === 'screencast-frame');
    expect(frame).toBeDefined();
    expect(session.screenshots).toHaveLength(1);
  });

  it('increments call counter per action', async () => {
    const sessionId = 'sess-counter';
    setupTracedSession(sessionId);

    const tool = vi.fn().mockResolvedValue(SUCCESS_RESULT) as unknown as ToolCallback;
    await (withTrace('navigate', tool) as AnyToolFn)({ url: 'https://a.com' }, extra);
    await (withTrace('click_element', tool) as AnyToolFn)({ selector: '#btn' }, extra);

    const session = getTraceSession(sessionId)!;
    const befores = session.events.filter((e) => e.type === 'before') as { callId: string }[];
    expect(befores[0].callId).toBe('call@1');
    expect(befores[1].callId).toBe('call@2');
  });

  it('marks after event with error when tool returns isError', async () => {
    const sessionId = 'sess-error';
    setupTracedSession(sessionId);

    const tool = vi.fn().mockResolvedValue(ERROR_RESULT) as unknown as ToolCallback;
    await (withTrace('navigate', tool) as AnyToolFn)({ url: 'https://fail.com' }, extra);

    const session = getTraceSession(sessionId)!;
    const after = session.events.find((e) => e.type === 'after') as { error?: { message: string } };
    expect(after?.error?.message).toBe('something failed');
  });

  it('traces mobile sessions when trace is enabled', async () => {
    const state = getState();
    const sessionId = 'sess-mobile';
    const mockBrowser = {
      takeScreenshot: vi.fn().mockResolvedValue(TINY_PNG),
    } as unknown as WebdriverIO.Browser;

    state.browsers.set(sessionId, mockBrowser);
    state.currentSession = sessionId;
    state.sessionMetadata.set(sessionId, { type: 'ios', capabilities: {}, isAttached: false, trace: true });

    createTraceSession(sessionId, 'chromium', { width: 390, height: 844 }, 'ios - iPhone 15', 'ios');

    const tool = vi.fn().mockResolvedValue(SUCCESS_RESULT) as unknown as ToolCallback;
    const wrapped = withTrace('tap_element', tool) as AnyToolFn;
    await wrapped({ selector: '~btn' }, extra);

    expect(tool).toHaveBeenCalledOnce();
    const session = getTraceSession(sessionId)!;
    await session.screenshotChain;
    expect(session.events.filter((e) => e.type === 'before')).toHaveLength(1);
    expect(session.events.filter((e) => e.type === 'after')).toHaveLength(1);
    expect(session.screenshots).toHaveLength(1);
  });

});

describe('recordInitialNavigation', () => {
  it('emits before, screencast-frame, and after events', async () => {
    const sessionId = 'sess-init-nav';
    setupTracedSession(sessionId);

    await recordInitialNavigation(sessionId, 'https://example.com');

    const session = getTraceSession(sessionId)!;
    expect(session.events.find((e) => e.type === 'before')).toBeDefined();
    expect(session.events.find((e) => e.type === 'after')).toBeDefined();
    expect(session.events.find((e) => e.type === 'screencast-frame')).toBeDefined();
  });

  it('includes the URL in the before event title', async () => {
    const sessionId = 'sess-init-nav-title';
    setupTracedSession(sessionId);

    await recordInitialNavigation(sessionId, 'https://example.com/path');

    const session = getTraceSession(sessionId)!;
    const before = session.events.find((e) => e.type === 'before') as { title: string };
    expect(before.title).toContain('https://example.com/path');
  });

  it('is a no-op when no trace session exists', async () => {
    await expect(recordInitialNavigation('nonexistent', 'https://x.com')).resolves.toBeUndefined();
  });
});
