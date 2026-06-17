import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browser } from 'webdriverio';
import { DigitalAiProvider, resolveCloudHost } from '../../src/providers/cloud/digitalai.provider';

describe('DigitalAiProvider', () => {
  let provider: DigitalAiProvider;

  beforeEach(() => {
    provider = new DigitalAiProvider();
    vi.stubEnv('DIGITALAI_CLOUD_URL', 'https://cloud.example.com');
    vi.stubEnv('DIGITALAI_ACCESS_KEY', 'access-key-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('resolveCloudHost', () => {
    it('strips protocol, trailing slashes, and /wd/hub', () => {
      expect(resolveCloudHost('https://cloud.example.com')).toBe('cloud.example.com');
      expect(resolveCloudHost('http://cloud.example.com/')).toBe('cloud.example.com');
      expect(resolveCloudHost('cloud.example.com/wd/hub')).toBe('cloud.example.com');
      expect(resolveCloudHost('cloud.example.com')).toBe('cloud.example.com');
    });

    it('returns undefined for empty input', () => {
      expect(resolveCloudHost(undefined)).toBeUndefined();
      expect(resolveCloudHost('')).toBeUndefined();
    });
  });

  describe('getConnectionConfig', () => {
    it('builds the hub config from DIGITALAI_CLOUD_URL without basic auth', () => {
      const config = provider.getConnectionConfig({ platform: 'browser' });
      expect(config.protocol).toBe('https');
      expect(config.hostname).toBe('cloud.example.com');
      expect(config.port).toBe(443);
      expect(config.path).toBe('/wd/hub');
      expect(config.user).toBeUndefined();
      expect(config.key).toBeUndefined();
    });

    it('throws when DIGITALAI_CLOUD_URL is missing', () => {
      vi.stubEnv('DIGITALAI_CLOUD_URL', '');
      expect(() => provider.getConnectionConfig({ platform: 'browser' })).toThrow(/DIGITALAI_CLOUD_URL/);
    });
  });

  describe('buildCapabilities — browser platform', () => {
    it('sets browserName and FLAT digitalai:accessKey (no digitalai:options) so the reporter activates', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps.browserName).toBe('chrome');
      expect(caps['digitalai:accessKey']).toBe('access-key-123');
      expect(caps['digitalai:options']).toBeUndefined();
    });

    it('maps edge to MicrosoftEdge', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'edge' });
      expect(caps.browserName).toBe('MicrosoftEdge');
    });

    it('combines os and osVersion into digitalai:osName (not platformName)', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', os: 'Windows', osVersion: '10' });
      expect(caps['digitalai:osName']).toBe('Windows 10');
      expect(caps.platformName).toBeUndefined();
    });

    it('uses os alone as digitalai:osName (e.g. "Mac OS Sequoia")', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', os: 'Mac OS Sequoia' });
      expect(caps['digitalai:osName']).toBe('Mac OS Sequoia');
    });

    it('omits digitalai:osName when no os provided', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps['digitalai:osName']).toBeUndefined();
    });

    it('omits browserVersion unless explicitly provided', () => {
      expect(provider.buildCapabilities({ platform: 'browser', browser: 'chrome' }).browserVersion).toBeUndefined();
      expect(provider.buildCapabilities({ platform: 'browser', browser: 'chrome', browserVersion: '149' }).browserVersion).toBe('149');
    });

    it('passes reporting session/project as flat digitalai:testName', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome', reporting: { project: 'Proj', session: 'Login test' } });
      expect(caps['digitalai:testName']).toBe('Login test');
    });

    it('throws when DIGITALAI_ACCESS_KEY is missing', () => {
      vi.stubEnv('DIGITALAI_ACCESS_KEY', '');
      expect(() => provider.buildCapabilities({ platform: 'browser', browser: 'chrome' })).toThrow(/DIGITALAI_ACCESS_KEY/);
    });
  });

  describe('buildCapabilities — mobile platform', () => {
    it('does NOT pin appiumVersion (Appium version is chosen at the project level)', () => {
      const caps = provider.buildCapabilities({ platform: 'android', deviceName: 'Pixel 7' });
      const dai = caps['digitalai:options'] as Record<string, unknown>;
      expect(dai.appiumVersion).toBeUndefined();
    });

    it('browser sessions use flat caps (no digitalai:options)', () => {
      const caps = provider.buildCapabilities({ platform: 'browser', browser: 'chrome' });
      expect(caps['digitalai:options']).toBeUndefined();
    });

    it('uses an explicit deviceQuery verbatim', () => {
      const caps = provider.buildCapabilities({ platform: 'android', deviceQuery: "@os='android' and @name='.*Pixel.*'" });
      const dai = caps['digitalai:options'] as Record<string, unknown>;
      expect(dai.deviceQuery).toBe("@os='android' and @name='.*Pixel.*'");
    });

    it('builds a deviceQuery from deviceName and platformVersion', () => {
      const caps = provider.buildCapabilities({ platform: 'android', deviceName: 'Pixel 7', platformVersion: '14' });
      const dai = caps['digitalai:options'] as Record<string, unknown>;
      expect(dai.deviceQuery).toBe("@os='android' and @version='14' and @name='Pixel 7'");
    });

    it('escapes single quotes in deviceName when building a deviceQuery', () => {
      const caps = provider.buildCapabilities({ platform: 'ios', deviceName: "iPhone 15 Pro's" });
      const dai = caps['digitalai:options'] as Record<string, unknown>;
      expect(dai.deviceQuery).toBe("@os='ios' and @name='iPhone 15 Pro\\'s'");
    });

    it('omits deviceQuery when only the platform is known', () => {
      const caps = provider.buildCapabilities({ platform: 'ios' });
      const dai = caps['digitalai:options'] as Record<string, unknown>;
      expect(dai.deviceQuery).toBeUndefined();
    });

    it('sets appium:app for native app refs', () => {
      const caps = provider.buildCapabilities({ platform: 'android', deviceName: 'Pixel 7', app: 'cloud:com.example.app' });
      expect(caps['appium:app']).toBe('cloud:com.example.app');
    });

    it('defaults automationName per platform', () => {
      expect(provider.buildCapabilities({ platform: 'ios', deviceName: 'iPhone 15' })['appium:automationName']).toBe('XCUITest');
      expect(provider.buildCapabilities({ platform: 'android', deviceName: 'Pixel 7' })['appium:automationName']).toBe('UiAutomator2');
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

  describe('onSessionClose', () => {
    it('marks the report Passed via seetest:client.setReportStatus', async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      const browser = { execute } as unknown as Browser;
      await provider.onSessionClose('s1', 'browser', { status: 'passed' }, undefined, browser);
      expect(execute).toHaveBeenCalledWith('seetest:client.setReportStatus', 'Passed', 'Test passed');
    });

    it('marks the report Failed and includes the reason', async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      const browser = { execute } as unknown as Browser;
      await provider.onSessionClose('s2', 'android', { status: 'failed', reason: 'element not found' }, undefined, browser);
      expect(execute).toHaveBeenCalledWith('seetest:client.setReportStatus', 'Failed', 'Test failed: element not found');
    });

    it('does nothing when no browser is provided', async () => {
      await expect(provider.onSessionClose('s3', 'browser', { status: 'passed' })).resolves.toBeUndefined();
    });

    it('does not throw when the command fails', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('session gone'));
      const browser = { execute } as unknown as Browser;
      await expect(
        provider.onSessionClose('s4', 'ios', { status: 'failed' }, undefined, browser),
      ).resolves.toBeUndefined();
    });
  });
});
