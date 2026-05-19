import { describe, expect, it } from 'vitest';
import { createTraceSession, getTraceSession, deleteTraceSession, getMonotonicMs } from '../../src/trace/state';

describe('createTraceSession', () => {
  it('creates a session with context-options as first event', () => {
    const session = createTraceSession('test-session-id', 'chromium', { width: 1280, height: 720 }, 'test');
    expect(session.events).toHaveLength(1);
    expect(session.events[0].type).toBe('context-options');
  });

  it('sets context-options fields correctly', () => {
    const session = createTraceSession('abcdef12-xyz', 'firefox', { width: 1920, height: 1080 }, 'my test');
    const ctxOpts = session.events[0] as { type: string; version: number; browserName: string; libraryName: string; title: string; contextId: string; monotonicTime: number };
    expect(ctxOpts.version).toBe(8);
    expect(ctxOpts.browserName).toBe('firefox');
    expect(ctxOpts.libraryName).toBe('@wdio/mcp');
    expect(ctxOpts.title).toBe('my test');
    expect(ctxOpts.contextId).toMatch(/^context@/);
    expect(ctxOpts.monotonicTime).toBe(0);
  });

  it('stores session in state and retrieves it', () => {
    createTraceSession('retrieve-me', 'chromium', { width: 1280, height: 720 }, 'x');
    expect(getTraceSession('retrieve-me')).toBeDefined();
  });

  it('derives pageId and contextId from first 8 chars of sessionId', () => {
    const session = createTraceSession('abcdef1234', 'chromium', { width: 1280, height: 720 }, 'x');
    expect(session.pageId).toBe('page@abcdef12');
    expect(session.contextId).toBe('context@abcdef12');
  });

  it('starts with empty events array after context-options', () => {
    const session = createTraceSession('empty-test', 'chromium', { width: 1280, height: 720 }, 'x');
    expect(session.callCounter).toBe(0);
    expect(session.screenshots).toHaveLength(0);
  });
});

describe('getTraceSession', () => {
  it('returns undefined for unknown session', () => {
    expect(getTraceSession('nonexistent')).toBeUndefined();
  });
});

describe('deleteTraceSession', () => {
  it('removes session from state', () => {
    createTraceSession('to-delete', 'chromium', { width: 1280, height: 720 }, 'x');
    deleteTraceSession('to-delete');
    expect(getTraceSession('to-delete')).toBeUndefined();
  });
});

describe('getMonotonicMs', () => {
  it('returns a non-negative number', () => {
    const session = createTraceSession('monotonic-test', 'chromium', { width: 1280, height: 720 }, 'x');
    const ms = getMonotonicMs(session);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
