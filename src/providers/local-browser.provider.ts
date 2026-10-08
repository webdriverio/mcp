import type { SessionProvider, ConnectionConfig } from './types';

const BIDI_RESPONSE_TIMEOUT_MS = 30_000;
const HEADLESS_TOKEN = 'HeadlessChrome/';

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
    return { bidiResponseTimeout: BIDI_RESPONSE_TIMEOUT_MS };
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const selectedBrowser = (options.browser as string | undefined) ?? 'chrome';
    const headless = (options.headless as boolean | undefined) ?? true;
    const windowWidth = (options.windowWidth as number | undefined) ?? 1280;
    const windowHeight = (options.windowHeight as number | undefined) ?? 800;
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};

    const headlessSupported = selectedBrowser !== 'safari';
    const effectiveHeadless = headless && headlessSupported;

    const chromiumArgs = [
      `--window-size=${windowWidth},${windowHeight}`,
      '--no-sandbox',
      '--disable-search-engine-choice-screen',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
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
      // With `normal` the driver holds every command until a page and all its
      // ads and trackers have loaded, which on busy sites takes tens of seconds
      // or minutes. The page tools give a page a few seconds to finish instead.
      // User capabilities can set it back.
      pageLoadStrategy: 'eager',
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

/** Headless Chrome/Edge announce `HeadlessChrome/`, which many sites block outright */
export async function matchHeadedUserAgent(browser: WebdriverIO.Browser): Promise<void> {
  if (!browser.isBidi) return;
  const current = await browser.execute(() => navigator.userAgent);
  if (typeof current !== 'string' || !current.includes(HEADLESS_TOKEN)) return;
  await browser.emulationSetUserAgentOverride({ userAgent: current.replace(HEADLESS_TOKEN, 'Chrome/') });
}

export const localBrowserProvider = new LocalBrowserProvider();
