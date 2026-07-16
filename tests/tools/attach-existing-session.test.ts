import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attach, remote } from 'webdriverio';
import { Local as BrowserstackTunnel } from 'browserstack-local';
import { registerSession } from '../../src/session/lifecycle';
import { startSessionTool, startSessionToolDefinition } from '../../src/tools/session.tool';

const mockBrowser = vi.hoisted(() => ({
  sessionId: 'existing-session-id',
  capabilities: {},
  url: vi.fn(),
}));

vi.mock('webdriverio', () => ({
  attach: vi.fn().mockResolvedValue(mockBrowser),
  remote: vi.fn(),
}));

vi.mock('browserstack-local', () => ({
  Local: vi.fn(),
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
const mockAttach = attach as ReturnType<typeof vi.fn>;
const mockRemote = remote as ReturnType<typeof vi.fn>;
const mockRegisterSession = registerSession as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BROWSERSTACK_USERNAME', 'testuser');
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'testkey');
  mockAttach.mockResolvedValue(mockBrowser);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('start_session with sessionId', () => {
  it('exposes sessionId in the tool schema', () => {
    const schema = startSessionToolDefinition.inputSchema.sessionId as unknown as {
      safeParse: (value: unknown) => { success: boolean };
    };

    expect(schema.safeParse('abc123').success).toBe(true);
    expect(schema.safeParse('').success).toBe(false);
  });

  it('attaches to an existing BrowserStack iOS session without creating a session', async () => {
    const result = await callTool({
      sessionId: 'existing-session-id',
      provider: 'browserstack',
      platform: 'ios',
    });

    expect(result.isError).toBeUndefined();
    expect(mockAttach).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'existing-session-id',
      protocol: 'https',
      hostname: 'hub-cloud.browserstack.com',
      port: 443,
      path: '/wd/hub',
      user: 'testuser',
      key: 'testkey',
      capabilities: expect.objectContaining({
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
      }),
    }));
    expect(mockRemote).not.toHaveBeenCalled();
    expect(BrowserstackTunnel).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Attached to existing ios session');
  });

  it('attaches to a local Appium endpoint without requiring an app or noReset', async () => {
    await callTool({
      sessionId: 'existing-session-id',
      provider: 'local',
      platform: 'android',
      appiumConfig: {
        protocol: 'http',
        host: 'appium.internal',
        port: 4725,
        path: '/wd/hub',
      },
    });

    expect(mockAttach).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'existing-session-id',
      protocol: 'http',
      hostname: 'appium.internal',
      port: 4725,
      path: '/wd/hub',
      capabilities: expect.objectContaining({
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
      }),
    }));
  });

  it('supports externally managed mobile WebDriver endpoints', async () => {
    await callTool({
      sessionId: 'existing-session-id',
      provider: 'external',
      platform: 'ios',
      webdriverConfig: {
        protocol: 'https',
        hostname: 'grid.example.com',
        port: 443,
        path: '/wd/hub',
      },
      capabilities: {
        'appium:deviceName': 'iPhone 15',
      },
    });

    expect(mockAttach).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'existing-session-id',
      hostname: 'grid.example.com',
      capabilities: expect.objectContaining({
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': 'iPhone 15',
      }),
    }));
  });

  it('registers the attached session as externally managed', async () => {
    await callTool({
      sessionId: 'existing-session-id',
      provider: 'browserstack',
      platform: 'ios',
    });

    expect(mockRegisterSession).toHaveBeenCalledWith(
      'existing-session-id',
      mockBrowser,
      expect.objectContaining({
        type: 'ios',
        provider: 'browserstack',
        isAttached: true,
        externallyManaged: true,
      }),
      expect.objectContaining({
        sessionId: 'existing-session-id',
        type: 'ios',
      }),
    );
  });

  it('navigates only when navigationUrl is explicitly supplied for a browser session', async () => {
    await callTool({
      sessionId: 'existing-session-id',
      provider: 'browserstack',
      platform: 'browser',
      browser: 'chrome',
      navigationUrl: 'https://example.com',
    });

    expect(mockBrowser.url).toHaveBeenCalledWith('https://example.com');
  });

  it('rejects sessionId combined with Chrome CDP attach', async () => {
    const result = await callTool({
      sessionId: 'existing-session-id',
      platform: 'browser',
      attach: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cannot be combined');
    expect(mockAttach).not.toHaveBeenCalled();
  });

  it('rejects starting a managed tunnel for an already-created session', async () => {
    const result = await callTool({
      sessionId: 'existing-session-id',
      provider: 'browserstack',
      platform: 'ios',
      tunnel: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cannot start an MCP-managed tunnel');
    expect(mockAttach).not.toHaveBeenCalled();
  });

  it('returns a tool error when WebdriverIO attachment fails', async () => {
    mockAttach.mockRejectedValueOnce(new Error('invalid session id'));

    const result = await callTool({
      sessionId: 'missing-session',
      provider: 'browserstack',
      platform: 'ios',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid session id');
  });
});
