import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remote } from 'webdriverio';
import { Local as BrowserstackTunnel } from 'browserstack-local';
import { startSessionTool } from '../../src/tools/session.tool';

vi.mock('browserstack-local', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Local: vi.fn(function(this: any) {
    this.start = vi.fn((_opts: Record<string, unknown>, cb: () => void) => cb());
    this.stop = vi.fn((cb: () => void) => cb());
  }),
}));

vi.stubEnv('BROWSERSTACK_USERNAME', 'testuser');
vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'testkey');

vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue({
    sessionId: 'bs-session-id',
    capabilities: {},
    setWindowSize: vi.fn(),
  }),
}));

vi.mock('../../src/session/lifecycle', () => ({
  registerSession: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getState: vi.fn(() => ({
    browsers: new Map(),
    currentSession: null,
    sessionMetadata: new Map(),
    sessionHistory: new Map(),
  })),
}));

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const callTool = startSessionTool as unknown as ToolFn;
const mockRemote = remote as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(BrowserstackTunnel).mockClear();
  mockRemote.mockResolvedValue({
    sessionId: 'bs-session-id',
    capabilities: {},
    setWindowSize: vi.fn(),
  });
});

describe('start_session with provider: browserstack', () => {
  it('calls remote() with BrowserStack hostname and credentials for browser platform', async () => {
    await callTool({ provider: 'browserstack', platform: 'browser', browser: 'chrome' });

    expect(mockRemote).toHaveBeenCalledWith(expect.objectContaining({
      hostname: 'hub.browserstack.com',
      protocol: 'https',
      port: 443,
      path: '/wd/hub',
      user: 'testuser',
      key: 'testkey',
    }));
  });

  it('builds bstack:options for browser platform', async () => {
    await callTool({
      provider: 'browserstack',
      platform: 'browser',
      browser: 'chrome',
      os: 'Windows',
      osVersion: '11',
    });

    const [call] = mockRemote.mock.calls;
    const bstackOpts = call[0].capabilities['bstack:options'];
    expect(bstackOpts).toBeDefined();
    expect(bstackOpts.os).toBe('Windows');
    expect(bstackOpts.osVersion).toBe('11');
  });

  it('calls remote() with BrowserStack connection for android platform', async () => {
    await callTool({
      provider: 'browserstack',
      platform: 'android',
      deviceName: 'Samsung Galaxy S23',
      app: 'bs://abc123',
    });

    expect(mockRemote).toHaveBeenCalledWith(expect.objectContaining({
      hostname: 'hub.browserstack.com',
      user: 'testuser',
      key: 'testkey',
      capabilities: expect.objectContaining({
        platformName: 'android',
        'appium:app': 'bs://abc123',
      }),
    }));
  });

  it('local browser session still works when provider is omitted', async () => {
    await callTool({ platform: 'browser', browser: 'chrome', headless: true });

    const [call] = mockRemote.mock.calls;
    expect(call[0].hostname).toBeUndefined();
    expect(call[0].capabilities.browserName).toBe('chrome');
  });
});

describe('start_session with browserstackLocal: true', () => {
  it('creates a BrowserstackTunnel instance and calls start() before remote()', async () => {
    await callTool({ provider: 'browserstack', platform: 'browser', browser: 'chrome', browserstackLocal: true });

    const tunnelInstance = vi.mocked(BrowserstackTunnel).mock.instances[0] as unknown as { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
    expect(tunnelInstance.start).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'testkey' }),
      expect.any(Function),
    );

    const startOrder = (tunnelInstance.start as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const remoteOrder = mockRemote.mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(remoteOrder);
  });

  it('does NOT call BrowserstackTunnel when browserstackLocal is false', async () => {
    await callTool({ provider: 'browserstack', platform: 'browser', browser: 'chrome', browserstackLocal: false });

    expect(BrowserstackTunnel).not.toHaveBeenCalled();
  });

  it('returns error and does not call remote() when tunnel start fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(BrowserstackTunnel).mockImplementationOnce(function(this: any) {
      this.start = vi.fn((_opts: Record<string, unknown>, cb: (err: Error) => void) => cb(new Error('tunnel failed')));
      this.stop = vi.fn();
    });

    const result = await callTool({ provider: 'browserstack', platform: 'browser', browser: 'chrome', browserstackLocal: true });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('tunnel failed');
    expect(mockRemote).not.toHaveBeenCalled();
  });

  it('creates a BrowserstackTunnel instance for mobile platform', async () => {
    await callTool({
      provider: 'browserstack',
      platform: 'android',
      deviceName: 'Samsung Galaxy S23',
      app: 'bs://abc123',
      browserstackLocal: true,
    });

    const tunnelInstance = vi.mocked(BrowserstackTunnel).mock.instances[0] as unknown as { start: ReturnType<typeof vi.fn> };
    expect(tunnelInstance.start).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'testkey' }),
      expect.any(Function),
    );
  });
});
