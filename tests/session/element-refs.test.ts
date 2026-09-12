import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/session/state', () => ({
  getState: vi.fn(() => ({ currentSession: 'session-1' })),
}));

import { getState } from '../../src/session/state';
import { clearRefs, resolveRef, storeRefs, withRefs } from '../../src/session/element-refs';

const mockGetState = getState as ReturnType<typeof vi.fn>;

type ToolFn = (args: Record<string, unknown>, extra: unknown) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;
const wrap = (cb: ReturnType<typeof vi.fn>): ToolFn => withRefs(cb as never) as unknown as ToolFn;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockReturnValue({ currentSession: 'session-1' });
  clearRefs('session-1');
  clearRefs('session-2');
});

describe('element refs', () => {
  it('passes non-ref values through untouched', () => {
    expect(resolveRef('#submit')).toBe('#submit');
    expect(resolveRef('//button[@id="x"]')).toBe('//button[@id="x"]');
    expect(resolveRef('e')).toBe('e');
  });

  it('resolves a stored ref to its selector', () => {
    storeRefs('session-1', { e3: { selector: '#submit', tagName: 'button', role: 'button', text: 'Go' } });
    expect(resolveRef('e3')).toBe('#submit');
  });

  it('prefers qualifiedSelector when present', () => {
    storeRefs('session-1', {
      e2: { selector: '~login', qualifiedSelector: '~login.instance(1)', tagName: 'input', role: 'textbox', text: '' },
    });
    expect(resolveRef('e2')).toBe('~login.instance(1)');
  });

  it('throws a re-snapshot hint for an unknown ref', () => {
    expect(() => resolveRef('e9')).toThrow(/Unknown element ref "e9"/);
    expect(() => resolveRef('e9')).toThrow(/wdio:\/\/session\/current\/snapshot/);
  });

  it('overwrites previous refs on each store', () => {
    storeRefs('session-1', { e1: { selector: '#old', tagName: 'a', role: 'link', text: '' } });
    storeRefs('session-1', { e1: { selector: '#new', tagName: 'a', role: 'link', text: '' } });
    expect(resolveRef('e1')).toBe('#new');
  });

  it('drops refs on clear', () => {
    storeRefs('session-1', { e1: { selector: '#gone', tagName: 'a', role: 'link', text: '' } });
    clearRefs('session-1');
    expect(() => resolveRef('e1')).toThrow(/Unknown element ref/);
  });

  it('does not leak refs across sessions', () => {
    storeRefs('session-2', { e1: { selector: '#other', tagName: 'a', role: 'link', text: '' } });
    expect(() => resolveRef('e1')).toThrow(/Unknown element ref/);
  });
});

describe('withRefs', () => {
  it('rewrites selector params before delegating', async () => {
    storeRefs('session-1', { e3: { selector: '#submit', tagName: 'button', role: 'button', text: 'Go' } });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb)({ selector: 'e3', timeout: 10 }, {});

    expect(cb).toHaveBeenCalledWith({ selector: '#submit', timeout: 10 }, {});
  });

  it('rewrites source and target selectors for drag_and_drop', async () => {
    storeRefs('session-1', {
      e1: { selector: '#src', tagName: 'div', role: 'generic', text: '' },
      e2: { selector: '#dst', tagName: 'div', role: 'generic', text: '' },
    });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb)({ sourceSelector: 'e1', targetSelector: 'e2' }, {});

    expect(cb).toHaveBeenCalledWith({ sourceSelector: '#src', targetSelector: '#dst' }, {});
  });

  it('returns an error result instead of throwing on an unknown ref', async () => {
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    const result = await wrap(cb)({ selector: 'e42' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown element ref "e42"');
    expect(cb).not.toHaveBeenCalled();
  });

  it('leaves plain selectors untouched', async () => {
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb)({ selector: '#plain' }, {});

    expect(cb).toHaveBeenCalledWith({ selector: '#plain' }, {});
  });

  it('delegates untouched when there is no session, so the tool reports the real cause', async () => {
    mockGetState.mockReturnValue({ currentSession: null });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'no session' }] }));

    const result = await wrap(cb)({ selector: 'e1' }, {});

    expect(cb).toHaveBeenCalledWith({ selector: 'e1' }, {});
    expect(result.content[0].text).toBe('no session');
  });
});
