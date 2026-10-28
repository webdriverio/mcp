import type { SessionProvider, ConnectionConfig } from './types';
import type { NetworkLogsMode } from '../session/state';

const BIDI_RESPONSE_TIMEOUT_MS = 30_000;
// Aborts hung classic commands natively and never replays a timed-out command; longer than the 30s action/BiDi timeouts.
const CONNECTION_RETRY_TIMEOUT_MS = 45_000;
const HEADLESS_TOKEN = 'HeadlessChrome/';

export type LocalBrowserOptions = {
  browser?: 'chrome' | 'firefox' | 'edge' | 'safari';
  headless?: boolean;
  windowWidth?: number;
  windowHeight?: number;
  capabilities?: Record<string, unknown>;
  networkLogs?: NetworkLogsMode;
};

export class LocalBrowserProvider implements SessionProvider {
  name = 'local-browser';

  getConnectionConfig(_options: Record<string, unknown>): ConnectionConfig {
    return {
      bidiResponseTimeout: BIDI_RESPONSE_TIMEOUT_MS,
      connectionRetryTimeout: CONNECTION_RETRY_TIMEOUT_MS,
      connectionRetryCount: 0,
    };
  }

  buildCapabilities(options: LocalBrowserOptions): Record<string, unknown> {
    const selectedBrowser = options.browser ?? 'chrome';
    const headless = options.headless ?? true;
    const windowWidth = options.windowWidth ?? 1280;
    const windowHeight = options.windowHeight ?? 800;
    const userCapabilities = options.capabilities ?? {};
    const networkLogs = options.networkLogs ?? 'none';

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
        if (networkLogs !== 'none') {
          capabilities['goog:loggingPrefs'] = { performance: 'ALL' };
        }
        break;
      case 'edge':
        capabilities.browserName = 'msedge';
        capabilities['ms:edgeOptions'] = { args: chromiumArgs };
        if (networkLogs !== 'none') {
          capabilities['ms:loggingPrefs'] = { performance: 'ALL' };
        }
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
      ...(selectedBrowser === 'chrome' && process.platform !== 'win32' && {
        'wdio:chromedriverOptions': this.withDetachedDriver(userCapabilities['wdio:chromedriverOptions']),
      }),
      'goog:chromeOptions': this.mergeCapabilityOptions(capabilities['goog:chromeOptions'], userCapabilities['goog:chromeOptions']),
      'goog:loggingPrefs': this.mergeCapabilityOptions(capabilities['goog:loggingPrefs'], userCapabilities['goog:loggingPrefs']),
      'ms:edgeOptions': this.mergeCapabilityOptions(capabilities['ms:edgeOptions'], userCapabilities['ms:edgeOptions']),
      'ms:loggingPrefs': this.mergeCapabilityOptions(capabilities['ms:loggingPrefs'], userCapabilities['ms:loggingPrefs']),
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

  private withDetachedDriver(customOptions: unknown): Record<string, unknown> {
    const custom = (customOptions ?? {}) as Record<string, unknown>;
    return { ...custom, spawnOpts: { detached: true, ...(custom.spawnOpts as Record<string, unknown> | undefined) } };
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
