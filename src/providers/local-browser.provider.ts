import type { SessionProvider, ConnectionConfig } from './types';

export type LocalBrowserOptions = {
  browser?: 'chrome' | 'firefox' | 'edge' | 'safari';
  headless?: boolean;
  windowWidth?: number;
  windowHeight?: number;
  capabilities?: Record<string, unknown>;
};

export class LocalBrowserProvider implements SessionProvider {
  name = 'local-browser';

  getConnectionConfig(_options: Record<string, unknown>): ConnectionConfig {
    return {}; // local — use WebdriverIO defaults
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const selectedBrowser = (options.browser as string | undefined) ?? 'chrome';
    const headless = (options.headless as boolean | undefined) ?? true;
    const windowWidth = (options.windowWidth as number | undefined) ?? 1920;
    const windowHeight = (options.windowHeight as number | undefined) ?? 1080;
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};

    const headlessSupported = selectedBrowser !== 'safari';
    const effectiveHeadless = headless && headlessSupported;

    const chromiumArgs = [
      `--window-size=${windowWidth},${windowHeight}`,
      '--no-sandbox',
      '--disable-search-engine-choice-screen',
      '--disable-infobars',
      '--log-level=3',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ];

    if (effectiveHeadless) {
      chromiumArgs.push('--headless=new');
      chromiumArgs.push('--disable-gpu');
      chromiumArgs.push('--disable-dev-shm-usage');
    }

    const firefoxArgs: string[] = [];
    if (effectiveHeadless && selectedBrowser === 'firefox') {
      firefoxArgs.push('-headless');
    }

    const capabilities: Record<string, any> = {
      acceptInsecureCerts: true,
    };

    switch (selectedBrowser) {
      case 'chrome':
        capabilities.browserName = 'chrome';
        capabilities['goog:chromeOptions'] = { args: chromiumArgs };
        break;
      case 'edge':
        capabilities.browserName = 'msedge';
        capabilities['ms:edgeOptions'] = { args: chromiumArgs };
        break;
      case 'firefox':
        capabilities.browserName = 'firefox';
        if (firefoxArgs.length > 0) {
          capabilities['moz:firefoxOptions'] = { args: firefoxArgs };
        }
        break;
      case 'safari':
        capabilities.browserName = 'safari';
        break;
    }

    const mergedCapabilities: Record<string, unknown> = {
      ...capabilities,
      ...userCapabilities,
      'goog:chromeOptions': this.mergeCapabilityOptions(capabilities['goog:chromeOptions'], userCapabilities['goog:chromeOptions']),
      'ms:edgeOptions': this.mergeCapabilityOptions(capabilities['ms:edgeOptions'], userCapabilities['ms:edgeOptions']),
      'moz:firefoxOptions': this.mergeCapabilityOptions(capabilities['moz:firefoxOptions'], userCapabilities['moz:firefoxOptions']),
    };

    for (const [key, value] of Object.entries(mergedCapabilities)) {
      if (value === undefined) {
        delete mergedCapabilities[key];
      }
    }

    return mergedCapabilities;
  }

  getSessionType(_options: Record<string, unknown>): 'browser' {
    return 'browser';
  }

  shouldAutoDetach(_options: Record<string, unknown>): boolean {
    return false;
  }

  private mergeCapabilityOptions(defaultOptions: unknown, customOptions: unknown): unknown {
    if (!defaultOptions || typeof defaultOptions !== 'object' || !customOptions || typeof customOptions !== 'object') {
      return customOptions ?? defaultOptions;
    }

    const defaultRecord = defaultOptions as Record<string, unknown>;
    const customRecord = customOptions as Record<string, unknown>;
    const merged = { ...defaultRecord, ...customRecord };
    if (Array.isArray(defaultRecord.args) || Array.isArray(customRecord.args)) {
      merged.args = [
        ...(Array.isArray(defaultRecord.args) ? defaultRecord.args : []),
        ...(Array.isArray(customRecord.args) ? customRecord.args : []),
      ];
    }
    return merged;
  }
}

export const localBrowserProvider = new LocalBrowserProvider();
