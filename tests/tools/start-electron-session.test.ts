import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startWdioSession: vi.fn(),
  registerSession: vi.fn(),
}));

vi.mock('../../src/electron/runtime', () => ({
  getElectronService: vi.fn(async () => ({ startWdioSession: mocks.startWdioSession })),
}));
vi.mock('../../src/session/lifecycle', () => ({ closeSession: vi.fn(), registerSession: mocks.registerSession }));

import { startSessionTool, startSessionToolDefinition } from '../../src/tools/session.tool';
import { getState } from '../../src/session/state';
import { generateCode } from '../../src/recording/code-generator';

const callStart = startSessionTool as unknown as (args: Record<string, unknown>, extra: unknown) => ReturnType<typeof startSessionTool>;

describe('start_session Electron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = getState();
    state.browsers.clear(); state.sessionMetadata.clear(); state.sessionHistory.clear(); state.currentSession = null;
    mocks.startWdioSession.mockResolvedValue({ sessionId: 'electron-session' });
  });

  it('starts an Electron session with official standalone helpers and browser-like metadata', async () => {
    const result = await callStart({
      platform: 'electron', browserVersion: '33.2.1', trace: false,
      capabilities: { 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/My App', appArgs: ['--test'] } },
    }, {});
    expect(result.isError).toBeUndefined();
    expect(mocks.startWdioSession).toHaveBeenCalledWith([expect.objectContaining({ browserName: 'electron', browserVersion: '33.2.1', 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/My App', appArgs: ['--test'] } })], undefined);
    expect(mocks.registerSession).toHaveBeenCalledWith('electron-session', expect.any(Object), expect.objectContaining({ type: 'browser', runtime: 'electron', provider: 'local' }), expect.objectContaining({ runtime: 'electron' }));
  });

  it('records immutable Electron capabilities when the standalone service mutates launch capabilities', async () => {
    mocks.startWdioSession.mockImplementation(async (capabilities: Record<string, unknown>[]) => {
      const launchCapabilities = capabilities[0];
      launchCapabilities.browserName = 'chrome';
      const options = launchCapabilities['wdio:electronServiceOptions'] as Record<string, unknown>;
      options.appArgs = ['--mutated-by-service'];
      return { sessionId: 'electron-session' };
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
    }), expect.any(Object));
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
