import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remote } from 'webdriverio';
import { startSessionTool } from '../../src/tools/session.tool';

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
