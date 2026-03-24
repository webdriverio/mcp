import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserStackProvider } from '../../src/providers/cloud/browserstack.provider';

describe('BrowserStackProvider', () => {
  let provider: BrowserStackProvider;

  beforeEach(() => {
    provider = new BrowserStackProvider();
  });

  describe('getConnectionConfig', () => {
    it('returns BrowserStack hub connection details', () => {
      const config = provider.getConnectionConfig({});
      expect(config.hostname).toBe('hub.browserstack.com');
      expect(config.protocol).toBe('https');
      expect(config.port).toBe(443);
      expect(config.path).toBe('/wd/hub');
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

    it('passes projectName, buildName, sessionName to bstack:options', () => {
      const caps = provider.buildCapabilities({
        platform: 'browser',
        browser: 'firefox',
        projectName: 'MyProject',
        buildName: 'build-1',
        sessionName: 'login test',
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

    it('defaults appiumVersion to 3.10.0', () => {
      const caps = provider.buildCapabilities({
        platform: 'android',
        deviceName: 'Pixel 7',
        app: 'bs://abc',
      });
      const bstack = caps['bstack:options'] as Record<string, unknown>;
      expect(bstack.appiumVersion).toBe('3.10.0');
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
});
