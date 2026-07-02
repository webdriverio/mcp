import type { ConnectionConfig, SessionProvider } from './types';

export type ExternalProviderOptions = {
  webdriverConfig?: {
    protocol?: string;
    hostname?: string;
    port?: number;
    path?: string;
  };
  browser?: string;
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
    return {
      browserName: (options.browser as string | undefined) ?? 'chrome',
      ...userCapabilities,
    };
  }

  getSessionType(_options: Record<string, unknown>): 'browser' {
    return 'browser';
  }

  shouldAutoDetach(_options: Record<string, unknown>): boolean {
    return true;
  }
}

export const externalProvider = new ExternalProvider();
