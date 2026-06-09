import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestingBotProvider } from '../../src/providers/cloud/testingbot.provider';
import testingbotTunnel from 'testingbot-tunnel-launcher';

vi.mock('testingbot-tunnel-launcher', () => ({
  default: {
    downloadAndRunAsync: vi.fn().mockResolvedValue({ close: (cb: () => void) => cb() }),
    killAsync: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('TestingBotProvider', () => {
  let provider: TestingBotProvider;

  beforeEach(() => {
    provider = new TestingBotProvider();
    vi.stubEnv('TESTINGBOT_KEY', 'tb-key');
    vi.stubEnv('TESTINGBOT_SECRET', 'tb-secret');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('getConnectionConfig', () => {
    it('returns hub.testingbot.com for browser platform', () => {
      const config = provider.getConnectionConfig({ platform: 'browser' });
      expect(config.hostname).toBe('hub.testingbot.com');
      expect(config.protocol).toBe('https');
      expect(config.port).toBe(443);
      expect(config.path).toBe('/wd/hub');
    });

    it('uses the same hub for mobile platforms', () => {
      expect(provider.getConnectionConfig({ platform: 'android' }).hostname).toBe('hub.testingbot.com');
      expect(provider.getConnectionConfig({ platform: 'ios' }).hostname).toBe('hub.testingbot.com');
    });

    it('maps TESTINGBOT_KEY/SECRET to user/key', () => {
      const config = provider.getConnectionConfig({});
      expect(config.user).toBe('tb-key');
      expect(config.key).toBe('tb-secret');
    });
  });

  describe('buildCapabilities — browser platform', () => {
    it('sets browserName and tb:options for browser platform', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps.browserName).toBe('chrome');
      expect(caps['tb:options']).toBeDefined();
    });

    it('defaults browserVersion to latest', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'firefox' });
      expect(caps.browserVersion).toBe('latest');
    });

    it('defaults platformName to Windows 11', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps.platformName).toBe('Windows 11');
    });

    it('combines os and osVersion into platformName', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', os: 'macOS', osVersion: 'Sonoma' });
      expect(caps.platformName).toBe('macOS Sonoma');
    });

    it('passes reporting labels to tb:options', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'firefox',
        reporting: { project: 'MyProject', build: 'build-1', session: 'login test' },
      });
      const tb = caps['tb:options'] as Record<string, unknown>;
      expect(tb.build).toBe('build-1');
      expect(tb.name).toBe('login test');
    });

    it('uses project as name when session is not provided', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        reporting: { project: 'MyProject' },
      });
      const tb = caps['tb:options'] as Record<string, unknown>;
      expect(tb.name).toBe('MyProject');
    });

    it('sets tunnel and tunnelIdentifier in tb:options when tunnel is enabled', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        tunnel: true,
        tunnelName: 'my-tunnel',
      });
      const tb = caps['tb:options'] as Record<string, unknown>;
      expect(tb.tunnel).toBe(true);
      expect(tb.tunnelIdentifier).toBe('my-tunnel');
    });

    it('merges user capabilities at top level', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        capabilities: { 'goog:chromeOptions': { args: ['--custom-flag'] } },
      });
      expect((caps['goog:chromeOptions'] as { args?: string[] })?.args).toContain('--custom-flag');
    });
  });

  describe('buildCapabilities — mobile platform', () => {
    it('sets platformName and appium:app for android native app', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        platformVersion: '13',
        app: 'tb://abc123',
      });
      expect(caps.platformName).toBe('android');
      expect(caps['appium:app']).toBe('tb://abc123');
      expect(caps['tb:options']).toBeDefined();
    });

    it('defaults autoGrantPermissions and autoAcceptAlerts to true', () => {
      const caps = provider.buildCapabilities({ platform: 'android', deviceName: 'Pixel 7', app: 'tb://abc' });
      expect(caps['appium:autoGrantPermissions']).toBe(true);
      expect(caps['appium:autoAcceptAlerts']).toBe(true);
    });

    it('clears autoAcceptAlerts when autoDismissAlerts is set', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'tb://abc',
        autoDismissAlerts: true,
      });
      expect(caps['appium:autoDismissAlerts']).toBe(true);
      expect(caps['appium:autoAcceptAlerts']).toBeUndefined();
    });

    it('sets browserName for mobile browser mode (no app)', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        platformVersion: '13',
        browser: 'chrome',
      });
      expect(caps.browserName).toBe('chrome');
      expect(caps['appium:app']).toBeUndefined();
    });

    it('defaults automationName for iOS and Android', () => {
      expect(provider.buildCapabilities({ platform: 'ios', deviceName: 'iPhone 15', app: 'tb://x' })['appium:automationName']).toBe('XCUITest');
      expect(provider.buildCapabilities({ platform: 'android', deviceName: 'Pixel 7', app: 'tb://x' })['appium:automationName']).toBe('UiAutomator2');
    });
  });

  describe('getSessionType', () => {
    it('maps platform to session type', () => {
      expect(provider.getSessionType({ platform: 'browser' })).toBe('browser');
      expect(provider.getSessionType({ platform: 'ios' })).toBe('ios');
      expect(provider.getSessionType({ platform: 'android' })).toBe('android');
    });
  });

  describe('shouldAutoDetach', () => {
    it('always returns false', () => {
      expect(provider.shouldAutoDetach({})).toBe(false);
    });
  });

  describe('startTunnel', () => {
    it('starts the tunnel via downloadAndRunAsync and returns the handle', async () => {
      const handle = await provider.startTunnel({ tunnelName: 'my-tunnel' });
      expect(vi.mocked(testingbotTunnel.downloadAndRunAsync)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'tb-key', apiSecret: 'tb-secret', tunnelIdentifier: 'my-tunnel' }),
      );
      expect(handle).not.toBeNull();
    });

    it('returns null when a tunnel is already running', async () => {
      vi.mocked(testingbotTunnel.downloadAndRunAsync).mockRejectedValueOnce(new Error('tunnel already running'));
      const handle = await provider.startTunnel({ tunnelName: 'dup' });
      expect(handle).toBeNull();
    });

    it('rethrows unexpected errors', async () => {
      vi.mocked(testingbotTunnel.downloadAndRunAsync).mockRejectedValueOnce(new Error('boom'));
      await expect(provider.startTunnel({})).rejects.toThrow('boom');
    });
  });

  describe('onSessionClose', () => {
    it('sends a form-encoded PUT to mark a browser test passed', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      await provider.onSessionClose('session-123', 'browser', { status: 'passed' });

      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.testingbot.com/v1/tests/session-123');
      expect(options.method).toBe('PUT');
      expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(new URLSearchParams(options.body as string).get('test[success]')).toBe('1');
    });

    it('uses the same REST path for mobile sessions (success=0 on failure)', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      await provider.onSessionClose('session-456', 'android', { status: 'failed', reason: 'crash' });

      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.testingbot.com/v1/tests/session-456');
      const params = new URLSearchParams(options.body as string);
      expect(params.get('test[success]')).toBe('0');
      expect(params.get('test[status_message]')).toBe('crash');
    });

    it('skips the API call when credentials are missing', async () => {
      vi.stubEnv('TESTINGBOT_KEY', '');
      vi.stubEnv('TESTINGBOT_SECRET', '');
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      await provider.onSessionClose('session-123', 'browser', { status: 'passed' });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not throw when the REST call fails', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));
      await expect(
        provider.onSessionClose('session-789', 'browser', { status: 'passed' }),
      ).resolves.toBeUndefined();
    });
  });
});
