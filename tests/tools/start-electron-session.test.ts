import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startWdioSession: vi.fn(),
  registerSession: vi.fn(),
  closeSession: vi.fn(),
  cleanupSessionRuntime: vi.fn(),
  captureDriverRoots: vi.fn(),
  driverTree: vi.fn(),
  killPids: vi.fn(),
}));

vi.mock('../../src/electron/runtime', () => ({
  getElectronService: vi.fn(async () => ({ startWdioSession: mocks.startWdioSession })),
  cleanupSessionRuntime: mocks.cleanupSessionRuntime,
}));
vi.mock('../../src/session/driver-tree', () => ({
  captureDriverRoots: mocks.captureDriverRoots,
  driverTree: mocks.driverTree,
  killPids: mocks.killPids,
}));
vi.mock('../../src/session/lifecycle', () => ({ closeSession: mocks.closeSession, registerSession: mocks.registerSession }));

import { startSessionTool, startSessionToolDefinition } from '../../src/tools/session.tool';
import { getState } from '../../src/session/state';
import { runInSessionQueue } from '../../src/session/routing';
import { generateCode } from '../../src/recording/code-generator';

const callStart = startSessionTool as unknown as (args: Record<string, unknown>, extra: unknown) => ReturnType<typeof startSessionTool>;

describe('start_session Electron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = getState();
    state.browsers.clear(); state.sessionMetadata.clear(); state.sessionHistory.clear(); state.currentSession = null;
    mocks.startWdioSession.mockResolvedValue({ sessionId: 'electron-session', capabilities: {} });
  });

  it('starts an Electron session with official standalone helpers and browser-like metadata', async () => {
    const result = await callStart({
      platform: 'electron', browserVersion: '33.2.1', trace: false,
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/My App', appArgs: ['--test'] } },
    }, {});
    expect(result.isError).toBeUndefined();
    expect(mocks.startWdioSession).toHaveBeenCalledWith([expect.objectContaining({ browserName: 'electron', browserVersion: '33.2.1', 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/My App', appArgs: ['--test'] } })], undefined);
    expect(mocks.registerSession).toHaveBeenCalledWith('electron-session', expect.any(Object), expect.objectContaining({ type: 'browser', runtime: 'electron', provider: 'local' }), expect.objectContaining({ runtime: 'electron' }), { keep: false, name: undefined });
  });

  it('replaces an Electron session without waiting on a hung command of the old session', async () => {
    const state = getState();
    state.browsers.set('old', {} as WebdriverIO.Browser);
    state.sessionMetadata.set('old', { type: 'browser', capabilities: {}, isAttached: false, runtime: 'electron' });
    state.currentSession = 'old';
    void runInSessionQueue('old', () => new Promise<never>(() => {}));

    const result = await callStart({
      platform: 'electron',
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app' } },
    }, {});

    expect(result.isError).toBeUndefined();
    expect(mocks.closeSession).toHaveBeenCalledWith('old', false, false, true);
    expect(mocks.startWdioSession).toHaveBeenCalled();
  });

  it('still deletes the Electron browser when runtime cleanup rejects after a failed registration', async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    mocks.startWdioSession.mockResolvedValueOnce({ sessionId: 'electron-session', capabilities: {}, deleteSession });
    mocks.registerSession.mockImplementationOnce(() => { throw new Error('boom'); });
    mocks.cleanupSessionRuntime.mockRejectedValueOnce(new Error('cleanup failed'));
    const result = await callStart({
      platform: 'electron',
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app' } },
    }, {});
    expect(result).toEqual(expect.objectContaining({ isError: true, content: [expect.objectContaining({ text: expect.stringContaining('boom') })] }));
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it('kills the driver tree instead of deleting the session when cleanup ended it and registration fails', async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const roots = [{ pid: 4242, started: 'start' }];
    const tree = [{ pid: 4243, started: 'child' }];
    mocks.startWdioSession.mockResolvedValueOnce({ sessionId: 'electron-session', capabilities: { 'wdio:driverPID': 4242 }, deleteSession });
    mocks.captureDriverRoots.mockReturnValueOnce(roots);
    mocks.driverTree.mockReturnValueOnce(tree);
    mocks.registerSession.mockImplementationOnce(() => { throw new Error('boom'); });
    mocks.cleanupSessionRuntime.mockResolvedValueOnce(true);

    const result = await callStart({
      platform: 'electron',
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app' } },
    }, {});

    expect(result.isError).toBe(true);
    expect(deleteSession).not.toHaveBeenCalled();
    expect(mocks.driverTree).toHaveBeenCalledWith(roots);
    expect(mocks.killPids).toHaveBeenCalledWith(tree);
  });

  it('deletes the Electron browser instead of killing the driver tree when cleanup did not end it', async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    mocks.startWdioSession.mockResolvedValueOnce({ sessionId: 'electron-session', capabilities: {}, deleteSession });
    mocks.registerSession.mockImplementationOnce(() => { throw new Error('boom'); });
    mocks.cleanupSessionRuntime.mockResolvedValueOnce(false);

    const result = await callStart({
      platform: 'electron',
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app' } },
    }, {});

    expect(result.isError).toBe(true);
    expect(deleteSession).toHaveBeenCalledOnce();
    expect(mocks.killPids).not.toHaveBeenCalled();
  });

  it('records the driver tree roots captured from wdio:driverPID', async () => {
    const roots = [{ pid: 4242, started: 'start' }];
    mocks.startWdioSession.mockResolvedValueOnce({ sessionId: 'electron-session', capabilities: { 'wdio:driverPID': 4242 } });
    mocks.captureDriverRoots.mockReturnValueOnce(roots);

    await callStart({
      platform: 'electron',
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app' } },
    }, {});

    expect(mocks.captureDriverRoots).toHaveBeenCalledWith(4242);
    expect(mocks.registerSession).toHaveBeenCalledWith('electron-session', expect.any(Object), expect.objectContaining({ driverRoots: roots }), expect.any(Object), { keep: false, name: undefined });
  });

  it('records immutable Electron capabilities when the standalone service mutates launch capabilities', async () => {
    mocks.startWdioSession.mockImplementation(async (capabilities: Record<string, unknown>[]) => {
      const launchCapabilities = capabilities[0];
      launchCapabilities.browserName = 'chrome';
      const options = launchCapabilities['wdio:electronServiceOptions'] as Record<string, unknown>;
      options.appArgs = ['--mutated-by-service'];
      return { sessionId: 'electron-session', capabilities: {} };
    });

    await callStart({
      platform: 'electron',
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/My App', appArgs: ['--original'] } },
    }, {});

    const [, , metadata, history] = mocks.registerSession.mock.calls[0];
    expect(metadata.capabilities).toMatchObject({
      browserName: 'electron',
      'wdio:electronServiceOptions': { appBinaryPath: '/Applications/My App', appArgs: ['--original'] },
    });
    expect(history.capabilities).toEqual(metadata.capabilities);
    history.steps.push({
      index: 1,
      tool: 'start_session',
      params: { platform: 'electron' },
      status: 'ok',
      durationMs: 0,
      timestamp: new Date().toISOString(),
    });
    expect(generateCode(history)).toContain('"browserName": "electron"');
  });

  it('forwards electronRootDir and normalizes the top-level deeplink scheme', async () => {
    await callStart({
      platform: 'electron',
      electronRootDir: '/project',
      electronDeeplinkScheme: 'myapp',
    }, {});

    expect(mocks.startWdioSession).toHaveBeenCalledWith([expect.objectContaining({ browserName: 'electron' })], { rootDir: '/project' });
    expect(mocks.registerSession).toHaveBeenCalledWith('electron-session', expect.any(Object), expect.objectContaining({
      electronDeeplinkScheme: 'myapp',
    }), expect.any(Object), { keep: false, name: undefined });
  });

  it('validates electronDeeplinkScheme as a URI scheme without a colon', () => {
    const schema = startSessionToolDefinition.inputSchema.electronDeeplinkScheme as unknown as {
      safeParse: (value: unknown) => { success: boolean; data?: string };
    };

    expect(schema.safeParse('myapp').success).toBe(true);
    expect(schema.safeParse('myapp:').success).toBe(false);
    expect(schema.safeParse('my app').success).toBe(false);
    expect(schema.safeParse('MyApp').data).toBe('myapp');
  });

  it('rejects cloud Electron and standalone log capture without a log directory', async () => {
    const cloud = await callStart({ platform: 'electron', provider: 'browserstack', capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app' } } }, {});
    const logs = await callStart({ platform: 'electron', capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app', captureRendererLogs: true } } }, {});
    expect(cloud.isError).toBe(true);
    expect(logs.isError).toBe(true);
    expect(mocks.startWdioSession).not.toHaveBeenCalled();
  });

  it('rejects attaching to an existing Electron session', async () => {
    const result = await callStart({ platform: 'electron', attach: true, capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/app' } } }, {});
    expect(result.isError).toBe(true);
    expect(mocks.startWdioSession).not.toHaveBeenCalled();
  });

  it('requires a capability application target or electronRootDir', async () => {
    const result = await callStart({ platform: 'electron', capabilities: {} }, {});
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('wdio:electronServiceOptions');
  });
});
