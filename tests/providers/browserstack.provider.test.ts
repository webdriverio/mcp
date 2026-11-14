import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockTunnel } = vi.hoisted(() => ({
  mockTunnel: { start: vi.fn(), stop: vi.fn() },
}));

vi.mock('browserstack-local', () => ({
  Local: class {
    start = mockTunnel.start;
    stop = mockTunnel.stop;
  },
}));

import { BrowserStackProvider } from '../../src/providers/cloud/browserstack.provider';

describe('BrowserStackProvider', () => {
  let provider: BrowserStackProvider;

  beforeEach(() => {
    provider = new BrowserStackProvider();
  });

  describe('getConnectionConfig', () => {
    it('returns hub.browserstack.com for browser platform', () => {
      const config = provider.getConnectionConfig({ platform: 'browser' });
      expect(config.hostname).toBe('hub.browserstack.com');
      expect(config.protocol).toBe('https');
      expect(config.port).toBe(443);
      expect(config.path).toBe('/wd/hub');
    });

    it('returns hub-cloud.browserstack.com for android platform', () => {
      const config = provider.getConnectionConfig({ platform: 'android' });
      expect(config.hostname).toBe('hub-cloud.browserstack.com');
    });

    it('returns hub-cloud.browserstack.com for ios platform', () => {
      const config = provider.getConnectionConfig({ platform: 'ios' });
      expect(config.hostname).toBe('hub-cloud.browserstack.com');
    });

    it('reads credentials from environment variables', () => {
      vi.stubEnv('BROWSERSTACK_USERNAME', 'myuser');
      vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'mykey');
      const config = provider.getConnectionConfig({});
      expect(config.user).toBe('myuser');
      expect(config.key).toBe('mykey');
      vi.unstubAllEnvs();
    });
  });

  describe('buildCapabilities — browser platform', () => {
    it('sets browserName and bstack:options for browser platform', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps.browserName).toBe('chrome');
      expect(caps['bstack:options']).toBeDefined();
    });

    it('defaults browserVersion to latest', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.browserVersion).toBe('latest');
    });

    it('passes os and osVersion to bstack:options', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        os: 'Windows',
        osVersion: '11',
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.os).toBe('Windows');
      expect(bstack.osVersion).toBe('11');
    });

    it('passes reporting labels to bstack:options', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'firefox',
        reporting: { project: 'MyProject', build: 'build-1', session: 'login test' },
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.projectName).toBe('MyProject');
      expect(bstack.buildName).toBe('build-1');
      expect(bstack.sessionName).toBe('login test');
    });

    it('merges user capabilities at top level', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        capabilities: { 'goog:chromeOptions': { args: ['--custom-flag'] } },
      });
      expect((caps['goog:chromeOptions'] as any)?.args).toContain('--custom-flag');
    });

    it('sets local: true in bstack:options when tunnel is true', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'chrome',
        tunnel: true,
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.local).toBe(true);
    });

    it('does not set local in bstack:options when tunnel is false', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', tunnel: false });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.local).toBeUndefined();
    });
  });

  describe('buildCapabilities — mobile platform', () => {
    it('sets platformName and appium:app for android', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Samsung Galaxy S23',
        platformVersion: '13.0',
        app: 'bs://abc123',
      });
      expect(caps.platformName).toBe('android');
      expect(caps['appium:app']).toBe('bs://abc123');
    });

    it('sets deviceName and platformVersion inside bstack:options', () => {
      const caps = provider.buildCapabilities({
        platform: 'ios',
        deviceName: 'iPhone 15',
        platformVersion: '17.0',
        app: 'bs://xyz',
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.deviceName).toBe('iPhone 15');
      expect(bstack.platformVersion).toBe('17.0');
    });

    it('defaults appiumVersion to 3.1.0', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'bs://abc',
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.appiumVersion).toBe('3.1.0');
    });

    it('defaults autoGrantPermissions and autoAcceptAlerts to true', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'bs://abc',
      });
      expect(caps['appium:autoGrantPermissions']).toBe(true);
      expect(caps['appium:autoAcceptAlerts']).toBe(true);
    });

    it('clears autoAcceptAlerts when autoDismissAlerts is set', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'bs://abc',
        autoDismissAlerts: true,
      });
      expect(caps['appium:autoDismissAlerts']).toBe(true);
      expect(caps['appium:autoAcceptAlerts']).toBeUndefined();
    });

    it('defaults newCommandTimeout to 300', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'bs://abc',
      });
      expect(caps['appium:newCommandTimeout']).toBe(300);
    });

    it('sets local: true in bstack:options when tunnel is true', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'bs://abc',
        tunnel: true,
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.local).toBe(true);
    });

    it('sets local: true in bstack:options when tunnel is "external"', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'bs://abc',
        tunnel: 'external',
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.local).toBe(true);
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

  describe('startTunnel', () => {
    beforeEach(() => {
      vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'testkey');
      mockTunnel.start.mockReset();
      mockTunnel.stop.mockReset();
    });

    it('returns the tunnel instance on successful start', async () => {
      mockTunnel.start.mockImplementation((opts: unknown, cb: (err: unknown) => void) => cb(null));

      const handle = await provider.startTunnel({});
      expect(handle).toBeDefined();
    });

    it('passes logFile pointing to os.tmpdir() to avoid polluting cwd', async () => {
      let capturedOpts: unknown;
      mockTunnel.start.mockImplementation((opts: unknown, cb: (err: unknown) => void) => {
        capturedOpts = opts;
        cb(null);
      });

      await provider.startTunnel({});
      const logFile = (capturedOpts as Record<string, unknown>).logFile as string;
      expect(logFile).toBeDefined();
      expect(logFile).toContain('browserstack-local');
    });

    it('passes forceLocal: true to tunnel start', async () => {
      let capturedOpts: unknown;
      mockTunnel.start.mockImplementation((opts: unknown, cb: (err: unknown) => void) => {
        capturedOpts = opts;
        cb(null);
      });

      await provider.startTunnel({});
      expect((capturedOpts as Record<string, unknown>).forceLocal).toBe(true);
    });

    it('returns null when tunnel is already running (plain object error with message)', async () => {
      mockTunnel.start.mockImplementation((opts: unknown, cb: (err: unknown) => void) =>
        cb({ message: 'another browserstack local client is running' }),
      );

      const handle = await provider.startTunnel({});
      expect(handle).toBeNull();
    });

    it('returns null when server is already listening (plain object error with message)', async () => {
      mockTunnel.start.mockImplementation((opts: unknown, cb: (err: unknown) => void) =>
        cb({ message: 'server is listening on port 45691' }),
      );

      const handle = await provider.startTunnel({});
      expect(handle).toBeNull();
    });

    it('rethrows unrecognised errors', async () => {
      mockTunnel.start.mockImplementation((opts: unknown, cb: (err: unknown) => void) =>
        cb({ message: 'some other fatal error' }),
      );

      await expect(provider.startTunnel({})).rejects.toEqual({ message: 'some other fatal error' });
    });
  });
});
