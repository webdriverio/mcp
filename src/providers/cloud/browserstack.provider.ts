import type { ConnectionConfig, SessionProvider } from '../types';

export class BrowserStackProvider implements SessionProvider {
  name = 'browserstack';

  getConnectionConfig(_options: Record<string, unknown>): ConnectionConfig {
    return {
      protocol: 'https',
      hostname: 'hub.browserstack.com',
      port: 443,
      path: '/wd/hub',
      user: process.env.BROWSERSTACK_USERNAME,
      key: process.env.BROWSERSTACK_ACCESS_KEY,
    };
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const platform = options.platform as string;
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};

    if (platform === 'browser') {
      const bstackOptions: Record<string, unknown> = {
        browserVersion: (options.browserVersion as string | undefined) ?? 'latest',
      };
      if (options.os) bstackOptions.os = options.os;
      if (options.osVersion) bstackOptions.osVersion = options.osVersion;
      if (options.projectName) bstackOptions.projectName = options.projectName;
      if (options.buildName) bstackOptions.buildName = options.buildName;
      if (options.sessionName) bstackOptions.sessionName = options.sessionName;

      return {
        browserName: (options.browser as string | undefined) ?? 'chrome',
        'bstack:options': bstackOptions,
        ...userCapabilities,
      };
    }

    // Mobile (ios / android)
    const bstackOptions: Record<string, unknown> = {
      platformName: platform,
      deviceName: options.deviceName,
      platformVersion: options.platformVersion,
      deviceType: 'phone',
      appiumVersion: '3.1.0',
    };
    if (options.projectName) bstackOptions.projectName = options.projectName;
    if (options.buildName) bstackOptions.buildName = options.buildName;
    if (options.sessionName) bstackOptions.sessionName = options.sessionName;

    return {
      platformName: platform,
      'appium:app': options.app,
      'bstack:options': bstackOptions,
      ...userCapabilities,
    };
  }

  getSessionType(options: Record<string, unknown>): 'browser' | 'ios' | 'android' {
    const platform = options.platform as string;
    if (platform === 'browser') return 'browser';
    return platform as 'ios' | 'android';
  }

  shouldAutoDetach(_options: Record<string, unknown>): boolean {
    return false;
  }
}

export const browserStackProvider = new BrowserStackProvider();
