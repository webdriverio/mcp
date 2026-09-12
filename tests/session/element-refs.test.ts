import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/session/state', () => ({
  getState: vi.fn(() => ({ currentSession: 'session-1', sessionHistory: new Map() })),
}));

vi.mock('../../src/recording/step-recorder', () => ({
  appendStep: vi.fn(),
}));

import { getState } from '../../src/session/state';
import { appendStep } from '../../src/recording/step-recorder';
import { clearRefs, resolveRef, stampRefs, storeRefs, withRefs } from '../../src/session/element-refs';

const mockGetState = getState as ReturnType<typeof vi.fn>;
const mockAppendStep = appendStep as ReturnType<typeof vi.fn>;

type ToolFn = (args: Record<string, unknown>, extra: unknown) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;
const wrap = (cb: ReturnType<typeof vi.fn>, name = 'click_element'): ToolFn =>
  withRefs(name, cb as never) as unknown as ToolFn;

const button = { selector: '#submit', tagName: 'button', role: 'button', text: 'Go' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockReturnValue({ currentSession: 'session-1', sessionHistory: new Map() });
  clearRefs('session-1');
  clearRefs('session-2');
});

describe('element refs', () => {
  it('passes non-ref values through untouched', () => {
    storeRefs('session-1', {});
    expect(resolveRef('#submit')).toBe('#submit');
    expect(resolveRef('//button[@id="x"]')).toBe('//button[@id="x"]');
    expect(resolveRef('element7')).toBe('element7');
  });

  it('resolves a ref carrying the current generation', () => {
    const generation = storeRefs('session-1', { e3: button });
    expect(resolveRef(`e3@${generation}`)).toBe('#submit');
  });

  it('prefers qualifiedSelector when present', () => {
    const generation = storeRefs('session-1', {
      e2: { selector: '~login', qualifiedSelector: '~login.instance(1)', tagName: 'input', role: 'textbox', text: '' },
    });
    expect(resolveRef(`e2@${generation}`)).toBe('~login.instance(1)');
  });

  it('tolerates surrounding whitespace on a ref an LLM pasted in', () => {
    const generation = storeRefs('session-1', { e3: button });
    expect(resolveRef(`  e3@${generation}  `)).toBe('#submit');
  });

  it('normalises a zero-padded ref number to the stored key', () => {
    const generation = storeRefs('session-1', { e3: button });
    expect(resolveRef(`e03@${generation}`)).toBe('#submit');
  });

  it('leaves a whitespace-padded non-ref untouched', () => {
    storeRefs('session-1', {});
    expect(resolveRef('  #submit  ')).toBe('  #submit  ');
  });

  it('refuses an unstamped ref rather than guessing its generation', () => {
    storeRefs('session-1', { e3: button });
    expect(() => resolveRef('e3')).toThrow(/missing its snapshot generation/);
    expect(() => resolveRef('e3')).toThrow(/get_snapshot/);
  });

  it('throws a re-snapshot hint for a ref not in the current snapshot', () => {
    const generation = storeRefs('session-1', {});
    expect(() => resolveRef(`e9@${generation}`)).toThrow(/is not in snapshot/);
    expect(() => resolveRef(`e9@${generation}`)).toThrow(/wdio:\/\/session\/current\/snapshot/);
  });

  it('throws when there is no snapshot at all', () => {
    expect(() => resolveRef('e1@1')).toThrow(/is unknown/);
  });

  it('overwrites previous refs on each store', () => {
    storeRefs('session-1', { e1: { selector: '#old', tagName: 'a', role: 'link', text: '' } });
    const generation = storeRefs('session-1', { e1: { selector: '#new', tagName: 'a', role: 'link', text: '' } });
    expect(resolveRef(`e1@${generation}`)).toBe('#new');
  });

  it('drops refs on clear', () => {
    storeRefs('session-1', { e1: button });
    clearRefs('session-1');
    expect(() => resolveRef('e1@1')).toThrow(/is unknown/);
  });

  it('does not leak refs across sessions', () => {
    storeRefs('session-2', { e1: button });
    expect(() => resolveRef('e1@1')).toThrow(/is unknown/);
  });

  it('allocates generations that never repeat, even across sessions', () => {
    const generations = [storeRefs('session-1', {}), storeRefs('session-2', {}), storeRefs('session-1', {})];

    expect(new Set(generations).size).toBe(3);
    expect(generations[2]).toBeGreaterThan(generations[1]);
  });

  it('cannot resolve a closed session\'s ref against a new session', () => {
    const dead = storeRefs('session-1', { e1: button });
    clearRefs('session-1');
    storeRefs('session-2', { e1: { selector: '#other', tagName: 'button', role: 'button', text: 'Other' } });
    mockGetState.mockReturnValue({ currentSession: 'session-2' });

    expect(() => resolveRef(`e1@${dead}`)).toThrow(/is from snapshot/);
  });
});

describe('stampRefs', () => {
  it('stamps every ref in the tree with the generation that produced it', () => {
    const tree = 'banner "Home"\n  e1  link "Go" → a\n    e12  button "X" → #x\nstatictext "e99 not a ref"';

    expect(stampRefs(tree, 4)).toBe(
      'banner "Home"\n  e1@4  link "Go" → a\n    e12@4  button "X" → #x\nstatictext "e99 not a ref"',
    );
  });

  it('does not mistake mid-line text for a ref', () => {
    expect(stampRefs('  statictext "see e1 above"', 2)).toBe('  statictext "see e1 above"');
  });

  it('stamps a ref sitting at the end of its line', () => {
    expect(stampRefs('  e5', 2)).toBe('  e5@2');
    expect(stampRefs('e5\nnext', 2)).toBe('e5@2\nnext');
  });
});

describe('snapshot generations', () => {
  it('rejects a ref from an older snapshot instead of acting on the wrong element', () => {
    const first = storeRefs('session-1', { e7: { selector: '#help', tagName: 'a', role: 'link', text: 'Help' } });
    const second = storeRefs('session-1', { e7: { selector: '#clear', tagName: 'button', role: 'button', text: 'Clear' } });

    expect(() => resolveRef(`e7@${first}`)).toThrow(new RegExp(`snapshot ${first}, but the current snapshot is ${second}`));
    expect(() => resolveRef(`e7@${first}`)).toThrow(/wdio:\/\/session\/current\/snapshot/);
    expect(resolveRef(`e7@${second}`)).toBe('#clear');
  });

  it('names the get_snapshot tool in every failure hint, not just the resource URI', () => {
    // Harnesses without MCP resource support can only act on tool output.
    expect(() => resolveRef('e3')).toThrow(/get_snapshot/);

    const generation = storeRefs('session-1', {});
    expect(() => resolveRef('e9@999')).toThrow(/get_snapshot/);
    expect(() => resolveRef(`e1@${generation}`)).toThrow(/get_snapshot/);
  });

  it('reports a stale ref as an error result rather than clicking the wrong element', async () => {
    const first = storeRefs('session-1', { e7: { selector: '#help', tagName: 'a', role: 'link', text: 'Help' } });
    storeRefs('session-1', { e7: { selector: '#clear', tagName: 'button', role: 'button', text: 'Clear' } });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    const result = await wrap(cb)({ selector: `e7@${first}` }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('is from snapshot');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('withRefs', () => {
  it('rewrites selector params before delegating', async () => {
    const generation = storeRefs('session-1', { e3: button });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb)({ selector: `e3@${generation}`, timeout: 10 }, {});

    expect(cb).toHaveBeenCalledWith({ selector: '#submit', timeout: 10 }, {});
  });

  it('rewrites source and target selectors for drag_and_drop', async () => {
    const generation = storeRefs('session-1', {
      e1: { selector: '#src', tagName: 'div', role: 'generic', text: '' },
      e2: { selector: '#dst', tagName: 'div', role: 'generic', text: '' },
    });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb)({ sourceSelector: `e1@${generation}`, targetSelector: `e2@${generation}` }, {});

    expect(cb).toHaveBeenCalledWith({ sourceSelector: '#src', targetSelector: '#dst' }, {});
  });

  it('returns an error result instead of throwing on an unknown ref', async () => {
    const generation = storeRefs('session-1', {});
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    const result = await wrap(cb)({ selector: `e42@${generation}` }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(`is not in snapshot ${generation}`);
    expect(cb).not.toHaveBeenCalled();
  });

  it('leaves plain selectors untouched', async () => {
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb)({ selector: '#plain' }, {});

    expect(cb).toHaveBeenCalledWith({ selector: '#plain' }, {});
  });

  it('delegates untouched when there is no session, so the tool reports the real cause', async () => {
    mockGetState.mockReturnValue({ currentSession: null, sessionHistory: new Map() });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'no session' }] }));

    const result = await wrap(cb)({ selector: 'e1@1' }, {});

    expect(cb).toHaveBeenCalledWith({ selector: 'e1@1' }, {});
    expect(result.content[0].text).toBe('no session');
  });

  it('records a ref failure in the step log under the tool name', async () => {
    const generation = storeRefs('session-1', {});
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb, 'set_value')({ selector: `e42@${generation}` }, {});

    expect(mockAppendStep).toHaveBeenCalledWith(
      'set_value',
      { selector: `e42@${generation}` },
      'error',
      0,
      expect.stringContaining('is not in snapshot'),
    );
  });

  it('does not record anything when the ref resolves', async () => {
    const generation = storeRefs('session-1', { e3: button });
    const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));

    await wrap(cb)({ selector: `e3@${generation}` }, {});

    expect(mockAppendStep).not.toHaveBeenCalled();
  });
});
