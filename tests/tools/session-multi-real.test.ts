import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { remote } from 'webdriverio';
import { attachSessionRecorded, startSessionTool } from '../../src/tools/session.tool';
import { withRecording } from '../../src/recording/step-recorder';
import * as lifecycle from '../../src/session/lifecycle';
import { withSessionTarget, withSessionlessContext } from '../../src/session/routing';
import { getState } from '../../src/session/state';

vi.mock('webdriverio', () => ({ attach: vi.fn(), remote: vi.fn() }));

type Result = { content: { text: string }[]; isError?: boolean };
type Fn = (args: Record<string, unknown>, extra: unknown) => Promise<Result>;

// Same composition server.ts applies to session-less tools.
const start = withSessionlessContext(withRecording('start_session', startSessionTool)) as unknown as Fn;
const attachTool = withSessionlessContext(attachSessionRecorded) as unknown as Fn;
const mockRemote = remote as ReturnType<typeof vi.fn>;

function fakeBrowser(sessionId: string) {
  return { sessionId, capabilities: {}, setWindowSize: vi.fn(), deleteSession: vi.fn().mockResolvedValue(undefined) };
}

const ext = { platform: 'browser', provider: 'external' };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('start_session with real state', () => {
  it('attributes the recording to the new kept session and leaves the default untouched', async () => {
    mockRemote.mockResolvedValueOnce(fakeBrowser('sess-a'));
    await start({ ...ext }, {});
    mockRemote.mockResolvedValueOnce(fakeBrowser('sess-b'));
    const result = await start({ ...ext, onExisting: 'keep', name: 'b' }, {});
    expect(result.isError).toBeUndefined();
    const state = getState();
    expect(state.sessionHistory.get('sess-b')?.steps[0].tool).toBe('start_session');
    expect(state.sessionHistory.get('sess-a')?.steps.map(s => s.tool)).toEqual(['start_session']);
    expect(state.currentSession).toBe('sess-a');
  });

  it('rejects a duplicate name before launching anything', async () => {
    mockRemote.mockResolvedValueOnce(fakeBrowser('sess-a'));
    await start({ ...ext, name: 'a' }, {});
    mockRemote.mockClear();
    const result = await start({ ...ext, onExisting: 'keep', name: 'a' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already in use');
    expect(mockRemote).not.toHaveBeenCalled();
  });

  it('allows reusing the name of the session being replaced', async () => {
    mockRemote.mockResolvedValueOnce(fakeBrowser('sess-a'));
    await start({ ...ext, name: 'a' }, {});
    mockRemote.mockResolvedValueOnce(fakeBrowser('sess-a2'));
    const result = await start({ ...ext, name: 'a' }, {});
    expect(result.isError).toBeUndefined();
    expect(getState().currentSession).toBe('sess-a2');
    expect(getState().sessionMetadata.get('sess-a2')?.name).toBe('a');
  });

  it('deletes the new browser when registration throws', async () => {
    const created = fakeBrowser('sess-x');
    mockRemote.mockResolvedValueOnce(created);
    vi.spyOn(lifecycle, 'registerSession').mockImplementationOnce(() => { throw new Error('boom'); });
    const result = await start({ ...ext }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('boom');
    expect(created.deleteSession).toHaveBeenCalledOnce();
  });
});

describe('attach_session with real state', () => {
  it('does not record a step for a name-only lookup', async () => {
    mockRemote.mockResolvedValueOnce(fakeBrowser('sess-a'));
    await start({ ...ext, name: 'a' }, {});
    const result = await attachTool({ name: 'a' }, {});
    expect(result.isError).toBeUndefined();
    expect(getState().sessionHistory.get('sess-a')?.steps.map(s => s.tool)).toEqual(['start_session']);
  });
});

describe('withSessionTarget guards', () => {
  const cb = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ran' }] }));
  const mobileOnly = withSessionTarget('tap_element', cb as unknown as ToolCallback) as unknown as Fn;

  function addSession(id: string, type: 'browser' | 'android', name?: string) {
    const state = getState();
    state.browsers.set(id, {} as WebdriverIO.Browser);
    state.sessionMetadata.set(id, { type, capabilities: {}, isAttached: false, name });
  }

  it('rejects a mobile-only tool when the default session is a browser', async () => {
    addSession('web-1', 'browser');
    addSession('and-1', 'android', 'droid');
    getState().currentSession = 'web-1';
    const result = await mobileOnly({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('tap_element');
    expect(result.content[0].text).toContain('browser');
    expect(cb).not.toHaveBeenCalled();
  });

  it('lists live sessions when there is no default', async () => {
    addSession('and-1', 'android', 'droid');
    const result = await mobileOnly({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No default session');
    expect(result.content[0].text).toContain('droid (and-1)');
  });
});
