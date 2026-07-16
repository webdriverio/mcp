import type { ConnectionConfig, SessionProvider } from './types';

export type ExternalProviderOptions = {
  webdriverConfig?: {
    protocol?: string;
    hostname?: string;
    port?: number;
    path?: string;
  };
  browser?: string;
  platform?: 'browser' | 'ios' | 'android';
  automationName?: 'XCUITest' | 'UiAutomator2';
  capabilities?: Record<string, unknown>;
};

export class ExternalProvider implements SessionProvider {
  name = 'external';

  getConnectionConfig(options: Record<string, unknown>): ConnectionConfig {
    const config = options.webdriverConfig as ExternalProviderOptions['webdriverConfig'] | undefined;
    return {
      protocol: config?.protocol ?? 'http',
      hostname: config?.hostname ?? '127.0.0.1',
      port: config?.port ?? 4445,
      path: config?.path ?? '/',
    };
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};
    const platform = options.platform as ExternalProviderOptions['platform'];

    if (platform === 'ios' || platform === 'android') {
      return {
        platformName: platform === 'ios' ? 'iOS' : 'Android',
        'appium:automationName': (options.automationName as string | undefined)
          ?? (platform === 'ios' ? 'XCUITest' : 'UiAutomator2'),
        ...userCapabilities,
      };
    }

    return {
      browserName: (options.browser as string | undefined) ?? 'chrome',
      ...userCapabilities,
    };
  }

  getSessionType(options: Record<string, unknown>): 'browser' | 'ios' | 'android' {
    return (options.platform as 'browser' | 'ios' | 'android' | undefined) ?? 'browser';
  }

  shouldAutoDetach(_options: Record<string, unknown>): boolean {
    return true;
  }
}

export const externalProvider = new ExternalProvider();
