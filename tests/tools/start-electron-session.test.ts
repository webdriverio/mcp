import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startWdioSession: vi.fn(),
  createElectronCapabilities: vi.fn(),
  registerSession: vi.fn(),
}));

vi.mock('../../src/electron/runtime', () => ({
  getElectronService: vi.fn(async () => ({ startWdioSession: mocks.startWdioSession, createElectronCapabilities: mocks.createElectronCapabilities })),
}));
vi.mock('../../src/session/lifecycle', () => ({ closeSession: vi.fn(), registerSession: mocks.registerSession }));

import { startSessionTool, startSessionToolDefinition } from '../../src/tools/session.tool';
import { getState } from '../../src/session/state';

const callStart = startSessionTool as unknown as (args: Record<string, unknown>, extra: unknown) => ReturnType<typeof startSessionTool>;

describe('start_session Electron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = getState();
    state.browsers.clear(); state.sessionMetadata.clear(); state.sessionHistory.clear(); state.currentSession = null;
    mocks.createElectronCapabilities.mockImplementation((options) => ({ browserName: 'electron', 'wdio:electronServiceOptions': options }));
    mocks.startWdioSession.mockResolvedValue({ sessionId: 'electron-session' });
  });

  it('starts an Electron session with official standalone helpers and browser-like metadata', async () => {
    const result = await callStart({
      platform: 'electron', browserVersion: '33.2.1', trace: false,
      electronOptions: { appBinaryPath: '/Applications/My App', appArgs: ['--test'] },
    }, {});
    expect(result.isError).toBeUndefined();
    expect(mocks.createElectronCapabilities).toHaveBeenCalledWith({ appBinaryPath: '/Applications/My App', appArgs: ['--test'] });
    expect(mocks.startWdioSession).toHaveBeenCalledWith([expect.objectContaining({ browserName: 'electron', browserVersion: '33.2.1' })], undefined);
    expect(mocks.registerSession).toHaveBeenCalledWith('electron-session', expect.any(Object), expect.objectContaining({ type: 'browser', runtime: 'electron', provider: 'local' }), expect.objectContaining({ runtime: 'electron' }));
  });

  it('normalizes deeplinkScheme in metadata without passing it to the Electron service', async () => {
    await callStart({
      platform: 'electron',
      electronOptions: { appBinaryPath: '/Applications/My App', deeplinkScheme: 'MyApp' },
    }, {});

    expect(mocks.createElectronCapabilities).toHaveBeenCalledWith({ appBinaryPath: '/Applications/My App' });
    expect(mocks.registerSession).toHaveBeenCalledWith('electron-session', expect.any(Object), expect.objectContaining({
      electronDeeplinkScheme: 'myapp',
    }), expect.any(Object));
  });

  it('validates deeplinkScheme as a URI scheme without a colon', () => {
    const schema = startSessionToolDefinition.inputSchema.electronOptions as unknown as {
      safeParse: (value: unknown) => { success: boolean; data?: { deeplinkScheme?: string } };
    };

    expect(schema.safeParse({ deeplinkScheme: 'myapp' }).success).toBe(true);
    expect(schema.safeParse({ deeplinkScheme: 'myapp:' }).success).toBe(false);
    expect(schema.safeParse({ deeplinkScheme: 'my app' }).success).toBe(false);
    expect(schema.safeParse({ deeplinkScheme: 'MyApp' }).data?.deeplinkScheme).toBe('myapp');
  });

  it('rejects cloud Electron and standalone log capture without a log directory', async () => {
    const cloud = await callStart({ platform: 'electron', provider: 'browserstack', electronOptions: { appBinaryPath: '/app' } }, {});
    const logs = await callStart({ platform: 'electron', electronOptions: { appBinaryPath: '/app', captureRendererLogs: true } }, {});
    expect(cloud.isError).toBe(true);
    expect(logs.isError).toBe(true);
    expect(mocks.startWdioSession).not.toHaveBeenCalled();
  });
});
