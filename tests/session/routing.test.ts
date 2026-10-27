import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getState } from '../../src/session/state';
import { resolveSession, withSessionTarget, sessionContext, activeSessionId } from '../../src/session/routing';

const extra = {} as Parameters<ToolCallback>[1];
type Fn = (args: Record<string, unknown>, extra: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }>;

function addSession(id: string, name?: string) {
  const state = getState();
  state.browsers.set(id, {} as WebdriverIO.Browser);
  state.sessionMetadata.set(id, { type: 'browser', capabilities: {}, isAttached: false, ...(name && { name }) });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('resolveSession', () => {
  it('prefers an exact sessionId over a name', () => {
    addSession('abc', 'xyz');
    addSession('xyz', 'abc');
    expect(resolveSession('abc')).toBe('abc');
  });

  it('resolves by name', () => {
    addSession('abcdefghijkl', 'b');
    expect(resolveSession('b')).toBe('abcdefghijkl');
  });

  it('lists live sessions for an unknown target', () => {
    addSession('abcdefghijkl', 'b');
    expect(() => resolveSession('nope')).toThrow('Unknown session "nope". Live sessions: b (abcdefgh)');
  });

  it('says none when no session is live', () => {
    expect(() => resolveSession('nope')).toThrow('Live sessions: none');
  });
});

describe('withSessionTarget', () => {
  const echo = (): ToolCallback => (async () => ({
    content: [{ type: 'text', text: String(activeSessionId()) }],
  })) as unknown as ToolCallback;

  it('returns an error result for an unknown target', async () => {
    addSession('s1');
    const result = await (withSessionTarget('navigate', echo()) as unknown as Fn)({ session: 'nope' }, extra);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown session "nope"');
  });

  it('rejects a tool that does not apply to the target platform', async () => {
    addSession('s1');
    getState().sessionMetadata.get('s1')!.type = 'android';
    const result = await (withSessionTarget('press_key', echo()) as unknown as Fn)({ session: 's1' }, extra);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('press_key');
  });

  it('leaves single-session untargeted output unprefixed', async () => {
    addSession('s1');
    getState().currentSession = 's1';
    const result = await (withSessionTarget('navigate', echo()) as unknown as Fn)({}, extra);
    expect(result.content).toEqual([{ type: 'text', text: 's1' }]);
  });

  it('prefixes the result and routes to the target without changing the default', async () => {
    addSession('s1');
    addSession('s2-long-identifier', 'b');
    getState().currentSession = 's1';
    const result = await (withSessionTarget('navigate', echo()) as unknown as Fn)({ session: 'b' }, extra);
    expect(result.content).toEqual([
      { type: 'text', text: '[session: b (s2-long-)]' },
      { type: 'text', text: 's2-long-identifier' },
    ]);
    expect(getState().currentSession).toBe('s1');
  });

  it('strips the session arg before calling the tool', async () => {
    addSession('s1');
    let seen: unknown;
    const cb = (async (args: unknown) => { seen = args; return { content: [] }; }) as unknown as ToolCallback;
    await (withSessionTarget('navigate', cb) as unknown as Fn)({ session: 's1', url: 'u' }, extra);
    expect(seen).toEqual({ url: 'u' });
  });

  it('serializes calls to the same session', async () => {
    addSession('s1');
    const gate = deferred();
    const log: string[] = [];
    const cb = (async (args: { n: number }) => {
      log.push(`start${args.n}`);
      if (args.n === 1) await gate.promise;
      log.push(`end${args.n}`);
      return { content: [] };
    }) as unknown as ToolCallback;
    const wrapped = withSessionTarget('navigate', cb) as unknown as Fn;
    const p1 = wrapped({ session: 's1', n: 1 }, extra);
    const p2 = wrapped({ session: 's1', n: 2 }, extra);
    await tick();
    expect(log).toEqual(['start1']);
    gate.resolve();
    await Promise.all([p1, p2]);
    expect(log).toEqual(['start1', 'end1', 'start2', 'end2']);
  });

  it('runs calls to different sessions concurrently', async () => {
    addSession('s1');
    addSession('s2');
    const gate = deferred();
    const log: string[] = [];
    const cb = (async () => {
      log.push(`start-${activeSessionId()}`);
      await gate.promise;
      return { content: [] };
    }) as unknown as ToolCallback;
    const wrapped = withSessionTarget('navigate', cb) as unknown as Fn;
    const p1 = wrapped({ session: 's1' }, extra);
    const p2 = wrapped({ session: 's2' }, extra);
    await tick();
    expect(log.sort()).toEqual(['start-s1', 'start-s2']);
    gate.resolve();
    await Promise.all([p1, p2]);
  });

  it('keeps the chain alive after a rejected call', async () => {
    addSession('s1');
    const failing = (async () => { throw new Error('boom'); }) as unknown as ToolCallback;
    await expect((withSessionTarget('navigate', failing) as unknown as Fn)({ session: 's1' }, extra)).rejects.toThrow('boom');
    const result = await (withSessionTarget('navigate', echo()) as unknown as Fn)({ session: 's1' }, extra);
    expect(result.content.at(-1)?.text).toBe('s1');
  });

  it('runs inside a context object when no session exists', async () => {
    const cb = (async () => ({ content: [{ type: 'text', text: String(sessionContext.getStore() !== undefined) }] })) as unknown as ToolCallback;
    const result = await (withSessionTarget('navigate', cb) as unknown as Fn)({}, extra);
    expect(result.content[0].text).toBe('true');
  });
});
