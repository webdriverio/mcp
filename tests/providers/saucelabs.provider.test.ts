import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SauceLabsProvider } from '../../src/providers/cloud/saucelabs.provider';

describe('SauceLabsProvider', () => {
  let provider: SauceLabsProvider;

  beforeEach(() => {
    provider = new SauceLabsProvider();
    vi.stubEnv('SAUCE_USERNAME', 'testuser');
    vi.stubEnv('SAUCE_ACCESS_KEY', 'testkey');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('getConnectionConfig', () => {
    it('returns region-specific hostname for browser platform', () => {
      const config = provider.getConnectionConfig({ platform: 'browser' });
      expect(config.hostname).toBe('ondemand.eu-central-1.saucelabs.com');
      expect(config.protocol).toBe('https');
      expect(config.port).toBe(443);
      expect(config.path).toBe('/wd/hub');
    });

    it('uses specified region in hostname', () => {
      const config = provider.getConnectionConfig({ platform: 'browser', region: 'us-west-1' });
      expect(config.hostname).toBe('ondemand.us-west-1.saucelabs.com');
    });

    it('returns same hostname pattern for mobile platforms', () => {
      const config = provider.getConnectionConfig({ platform: 'android' });
      expect(config.hostname).toBe('ondemand.eu-central-1.saucelabs.com');
    });

    it('reads credentials from environment variables', () => {
      const config = provider.getConnectionConfig({});
      expect(config.user).toBe('testuser');
      expect(config.key).toBe('testkey');
    });
  });

  describe('buildCapabilities — browser platform', () => {
    it('sets browserName and sauce:options for browser platform', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps.browserName).toBe('chrome');
      expect(caps['sauce:options']).toBeDefined();
    });

    it('defaults browserVersion to latest', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'firefox' });
      expect(caps.browserVersion).toBe('latest');
    });

    it('defaults platformName to Linux', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps.platformName).toBe('Linux');
    });

    it('combines os and osVersion into platformName', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', os: 'Windows', osVersion: '11' });
      expect(caps.platformName).toBe('Windows 11');
    });

    it('combines os and osVersion for Mac numbered name', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', os: 'Mac', osVersion: '15' });
      expect(caps.platformName).toBe('Mac 15');
    });

    it('uses os alone as platformName when osVersion is not provided', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', os: 'Linux' });
      expect(caps.platformName).toBe('Linux');
    });

    it('uses os alone as platformName for ChromiumOS', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', os: 'ChromiumOS' });
      expect(caps.platformName).toBe('ChromiumOS');
    });

    it('passes reporting labels to sauce:options', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'firefox',
        reporting: { project: 'MyProject', build: 'build-1', session: 'login test' },
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.build).toBe('build-1');
      expect(sauce.name).toBe('login test');
    });

    it('uses project as name when session is not provided', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        reporting: { project: 'MyProject' },
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.name).toBe('MyProject');
    });

    it('includes region in sauce:options', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.region).toBeDefined();
    });

    it('sets tunnelName in sauce:options when tunnel is enabled', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        tunnel: true,
        tunnelName: 'my-tunnel',
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.tunnelName).toBe('my-tunnel');
    });

    it('supports legacy saucelabsLocal alias', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        saucelabsLocal: true,
        tunnelName: 'legacy-tunnel',
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.tunnelName).toBe('legacy-tunnel');
    });

    it('does not set tunnelName when tunnel is enabled but no tunnelName is given', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        tunnel: true,
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce).not.toHaveProperty('tunnelName');
    });

    it('does not set tunnelName when tunnel is disabled', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        tunnelName: 'my-tunnel',
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce).not.toHaveProperty('tunnelName');
    });

    it('merges user-supplied sauce:options into generated sauce:options', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        capabilities: { 'sauce:options': { screenResolution: '1920x1080', extendedDebugging: true } },
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.screenResolution).toBe('1920x1080');
      expect(sauce.extendedDebugging).toBe(true);
      expect(sauce.region).toBeDefined();
    });

    it('generated region overrides a user-supplied sauce:options region', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        region: 'us-west-1',
        capabilities: { 'sauce:options': { region: 'eu-central-1' } },
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.region).toBe('us-west-1');
    });

    it('merges user sauce:options for mobile native app mode', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'storage:filename=app.apk',
        capabilities: { 'sauce:options': { extendedDebugging: true } },
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.extendedDebugging).toBe(true);
      expect(sauce.appiumVersion).toBe('latest');
    });

    it('merges user capabilities at top level', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        capabilities: { 'goog:chromeOptions': { args: ['--custom-flag'] } },
      });
      expect((caps['goog:chromeOptions'] as any)?.args).toContain('--custom-flag');
    });

    it('ignores platformName from user capabilities (os/osVersion are the API)', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        os: 'Windows',
        osVersion: '11',
        capabilities: { platformName: 'Mac 15' },
      });
      expect(caps.platformName).toBe('Windows 11');
    });
  });

  describe('buildCapabilities — mobile platform', () => {
    it('sets platformName and appium:app for android native app', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        platformVersion: '13',
        app: 'storage:filename=myapp.apk',
      });
      expect(caps.platformName).toBe('android');
      expect(caps['appium:app']).toBe('storage:filename=myapp.apk');
    });

    it('sets appiumVersion to latest for native app mode', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'storage:filename=app.apk',
      });
      const sauce = caps['sauce:options'] as Record<string, unknown>;
      expect(sauce.appiumVersion).toBe('latest');
    });

    it('defaults autoGrantPermissions and autoAcceptAlerts to true', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'storage:filename=app.apk',
      });
      expect(caps['appium:autoGrantPermissions']).toBe(true);
      expect(caps['appium:autoAcceptAlerts']).toBe(true);
    });

    it('clears autoAcceptAlerts when autoDismissAlerts is set', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'storage:filename=app.apk',
        autoDismissAlerts: true,
      });
      expect(caps['appium:autoDismissAlerts']).toBe(true);
      expect(caps['appium:autoAcceptAlerts']).toBeUndefined();
    });

    it('defaults newCommandTimeout to 300', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'storage:filename=app.apk',
      });
      expect(caps['appium:newCommandTimeout']).toBe(300);
    });

    it('defaults automationName for iOS', () => {
      const caps = provider.buildCapabilities({
        platform: 'ios',
        deviceName: 'iPhone 15',
        app: 'storage:filename=app.ipa',
      });
      expect(caps['appium:automationName']).toBe('XCUITest');
    });

    it('defaults automationName for Android', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'storage:filename=app.apk',
      });
      expect(caps['appium:automationName']).toBe('UiAutomator2');
    });
  });

  describe('getSessionType', () => {
    it('returns browser for browser platform', () => {
      expect(provider.getSessionType({ platform: 'browser' })).toBe('browser');
    });

    it('returns ios for ios platform', () => {
      expect(provider.getSessionType({ platform: 'ios' })).toBe('ios');
    });

    it('returns android for android platform', () => {
      expect(provider.getSessionType({ platform: 'android' })).toBe('android');
    });
  });

  describe('shouldAutoDetach', () => {
    it('always returns false', () => {
      expect(provider.shouldAutoDetach({})).toBe(false);
    });
  });

  describe('onSessionClose', () => {
    it('sends REST PUT for browser sessions', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      await provider.onSessionClose('session-123', 'browser', { status: 'passed' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/testuser/jobs/session-123'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ passed: true }),
        }),
      );
    });

    it('sends REST PUT for mobile sessions', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      await provider.onSessionClose('session-456', 'android', { status: 'failed' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/testuser/jobs/session-456'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ passed: false }),
        }),
      );
    });

    it('does not throw when REST PUT fails', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

      await expect(
        provider.onSessionClose('session-789', 'browser', { status: 'passed' }),
      ).resolves.toBeUndefined();
    });

    it('skips API call when credentials are missing', async () => {
      vi.stubEnv('SAUCE_USERNAME', '');
      vi.stubEnv('SAUCE_ACCESS_KEY', '');
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      await provider.onSessionClose('session-123', 'browser', { status: 'passed' });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
