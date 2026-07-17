import { describe, expect, it } from 'vitest';
import { ExternalProvider } from '../../src/providers/external.provider';

describe('ExternalProvider', () => {
  const provider = new ExternalProvider();

  it('defaults to a local WebDriver endpoint', () => {
    expect(provider.getConnectionConfig({})).toEqual({
      protocol: 'http',
      hostname: '127.0.0.1',
      port: 4445,
      path: '/',
    });
  });

  it('uses the provided WebDriver endpoint config', () => {
    expect(provider.getConnectionConfig({
      webdriverConfig: {
        protocol: 'https',
        hostname: 'webdriver.example.test',
        port: 443,
        path: '/wd/hub',
      },
    })).toEqual({
      protocol: 'https',
      hostname: 'webdriver.example.test',
      port: 443,
      path: '/wd/hub',
    });
  });

  it('defaults browserName to chrome and allows user capabilities to override it', () => {
    expect(provider.buildCapabilities({})).toEqual({ browserName: 'chrome' });
    expect(provider.buildCapabilities({
      capabilities: {
        browserName: 'tauri',
        webSocketUrl: true,
      },
    })).toEqual({
      browserName: 'tauri',
      webSocketUrl: true,
    });
  });

  it('builds platform capabilities for an attached iOS session', () => {
    expect(provider.buildCapabilities({ platform: 'ios' })).toEqual({
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
    });
    expect(provider.getSessionType({ platform: 'ios' })).toBe('ios');
  });

  it('builds platform capabilities for an attached Android session', () => {
    expect(provider.buildCapabilities({
      platform: 'android',
      capabilities: { 'appium:deviceName': 'Pixel 9' },
    })).toEqual({
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'Pixel 9',
    });
    expect(provider.getSessionType({ platform: 'android' })).toBe('android');
  });

  it('reports browser session semantics', () => {
    expect(provider.getSessionType({})).toBe('browser');
    expect(provider.shouldAutoDetach({})).toBe(true);
  });
});
