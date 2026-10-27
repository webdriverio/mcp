import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attach, remote } from 'webdriverio';
import { attachSessionTool, startSessionTool } from '../../src/tools/session.tool';
import { registerSession } from '../../src/session/lifecycle';
import { getState } from '../../src/session/state';

vi.mock('webdriverio', () => ({
  attach: vi.fn(),
  remote: vi.fn(),
}));

vi.mock('../../src/session/lifecycle', () => ({
  registerSession: vi.fn(),
  closeSession: vi.fn(),
}));

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const callStart = startSessionTool as unknown as ToolFn;
const callAttach = attachSessionTool as unknown as ToolFn;
const mockRemote = remote as ReturnType<typeof vi.fn>;
const mockRegisterSession = registerSession as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockRemote.mockResolvedValue({ sessionId: 'new-session-id', capabilities: {}, setWindowSize: vi.fn() });
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.currentSession = null;
});

describe('start_session multi-session options', () => {
  it('passes keep and name to registerSession when onExisting is keep', async () => {
    const result = await callStart({ platform: 'browser', provider: 'external', onExisting: 'keep', name: 'b' });
    expect(result.isError).toBeUndefined();
    expect(mockRegisterSession).toHaveBeenCalledWith('new-session-id', expect.any(Object), expect.any(Object), expect.any(Object), { keep: true, name: 'b' });
  });

  it('does not keep the existing session by default', async () => {
    await callStart({ platform: 'browser', provider: 'external' });
    expect(mockRegisterSession.mock.calls[0][4]).toEqual({ keep: false, name: undefined });
  });

  it('returns an error result when registerSession rejects a duplicate name', async () => {
    mockRegisterSession.mockImplementationOnce(() => { throw new Error('Session name "b" is already in use'); });
    const result = await callStart({ platform: 'browser', provider: 'external', onExisting: 'keep', name: 'b' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already in use');
  });
});

describe('attach_session by name', () => {
  function liveSession(id: string, name: string) {
    const state = getState();
    state.browsers.set(id, {} as WebdriverIO.Browser);
    state.sessionMetadata.set(id, { type: 'browser', capabilities: {}, isAttached: false, name });
  }

  it('reports a live named session as targetable', async () => {
    liveSession('abcdef123456', 'b');
    const result = await callAttach({ name: 'b' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('session: "b"');
  });

  it('errors with the live sessions when the name is unknown', async () => {
    liveSession('abcdef123456', 'b');
    const result = await callAttach({ name: 'missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown session "missing"');
    expect(result.content[0].text).toContain('b (abcdef12)');
  });

  it('does not keep alongside existing sessions by default when attaching by id', async () => {
    (attach as ReturnType<typeof vi.fn>).mockResolvedValue({ sessionId: 'att-1', capabilities: {} });
    await callAttach({ sessionId: 'att-1', platform: 'browser', provider: 'external', name: 'x' });
    expect(mockRegisterSession.mock.calls[0][4]).toEqual({ keep: false, name: 'x' });
  });

  it('errors when neither sessionId nor name is given', async () => {
    const result = await callAttach({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('sessionId');
  });
});
