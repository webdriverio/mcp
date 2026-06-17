import type { ConnectionConfig, SessionProvider, SessionResult } from '../types';
import type { Browser as WdioBrowser } from 'webdriverio';

/**
 * Normalize a Digital.ai cloud URL (DIGITALAI_CLOUD_URL) down to a bare hostname.
 * Accepts "https://cloud.example.com", "cloud.example.com", or a value that
 * already includes a trailing "/wd/hub".
 */
export function resolveCloudHost(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/wd\/hub\/?$/i, '')
    .replace(/\/+$/, '');
}

/** Map start_session browser names to the values the Digital.ai Selenium grid expects. */
const DIGITALAI_BROWSER_NAMES: Record<string, string> = {
  edge: 'MicrosoftEdge',
};

export class DigitalAiProvider implements SessionProvider {
  name = 'digitalai';

  getConnectionConfig(_options: Record<string, unknown>): ConnectionConfig {
    const hostname = resolveCloudHost(process.env.DIGITALAI_CLOUD_URL);
    if (!hostname) {
      throw new Error('Missing DIGITALAI_CLOUD_URL environment variable (your Digital.ai Testing cloud host, e.g. "https://cloud.example.com").');
    }
    // Digital.ai authenticates via the accessKey capability.
    return {
      protocol: 'https',
      hostname,
      port: 443,
      path: '/wd/hub',
    };
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const platform = options.platform as string;
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};
    const reporting = options.reporting as { project?: string; build?: string; session?: string } | undefined;

    const accessKey = process.env.DIGITALAI_ACCESS_KEY;
    if (!accessKey) {
      throw new Error('Missing DIGITALAI_ACCESS_KEY environment variable.');
    }

    const testName = reporting?.session ?? reporting?.project;

    if (platform === 'browser') {
      // Selenium grid: uses FLAT digitalai:* capabilities. The flat digitalai:accessKey +
      // digitalai:testName are what activate the reporter (the cloud returns a
      // digitalai:reportUrl); nesting them in digitalai:options authenticates but produces
      // no report. Target OS via digitalai:osName (NOT platformName).
      // Browser names: chrome | firefox | MicrosoftEdge | safari | opera.
      const browser = (options.browser as string | undefined) ?? 'chrome';
      const osName = options.os
        ? [options.os as string, options.osVersion as string | undefined].filter(Boolean).join(' ')
        : undefined;

      const caps: Record<string, unknown> = {
        ...userCapabilities,
        browserName: DIGITALAI_BROWSER_NAMES[browser] ?? browser,
        'digitalai:accessKey': accessKey,
      };
      if (testName) caps['digitalai:testName'] = testName;
      if (osName) caps['digitalai:osName'] = osName;
      if (options.browserVersion) caps.browserVersion = options.browserVersion as string;
      return caps;
    }

    // Mobile (ios / android) — Digital.ai caps go in the nested digitalai:options object.
    // The Appium server / version is selected at the Digital.ai project level (configure the
    // project for Appium-server execution), not pinned here, so it tracks whatever versions
    // the cloud supports. Devices via a deviceQuery.
    const digitalaiOptions: Record<string, unknown> = { accessKey };
    if (testName) digitalaiOptions.testName = testName;
    const deviceQuery = (options.deviceQuery as string | undefined) ?? buildDeviceQuery(platform, options);
    if (deviceQuery) digitalaiOptions.deviceQuery = deviceQuery;

    const caps: Record<string, unknown> = {
      platformName: platform,
      'appium:automationName': (options.automationName as string | undefined) ?? (platform === 'ios' ? 'XCUITest' : 'UiAutomator2'),
      'appium:newCommandTimeout': (options.newCommandTimeout as number | undefined) ?? 300,
      'digitalai:options': digitalaiOptions,
    };

    // Native app — Digital.ai app references look like "cloud:<package-or-bundle>".
    if (options.app) caps['appium:app'] = options.app;

    return { ...userCapabilities, ...caps };
  }

  getSessionType(options: Record<string, unknown>): 'browser' | 'ios' | 'android' {
    const platform = options.platform as string;
    if (platform === 'browser') return 'browser';
    return platform as 'ios' | 'android';
  }

  shouldAutoDetach(_options: Record<string, unknown>): boolean {
    return false;
  }

  /** Surface the live report link that Digital.ai returns as a session capability. */
  getStartNote(browser: WdioBrowser): string {
    const url = (browser.capabilities as Record<string, unknown> | undefined)?.['digitalai:reportUrl'];
    return typeof url === 'string' && url ? `\nReport: ${url}` : '';
  }

  /**
   * Mark the test passed/failed on the cloud via the seetest:client.setReportStatus
   * automation command (works for both Selenium and Appium sessions). Without this the
   * cloud defaults every report to "Passed". Status values: Passed | Failed | Skipped.
   *
   * Note: like the cloud's own pass/fail detection, this command flows over the classic
   * WebDriver protocol — pair it with `wdio:enforceWebDriverClassic: true` when you need
   * the status to land reliably (WebdriverIO's default BiDi transport can bypass it).
   */
  async onSessionClose(
    _sessionId: string,
    _sessionType: 'browser' | 'ios' | 'android',
    result: SessionResult,
    _tunnelHandle?: unknown,
    browser?: WdioBrowser,
  ): Promise<void> {
    if (!browser) return;
    const passed = result.status === 'passed';
    const status = passed ? 'Passed' : 'Failed';
    const message = passed
      ? 'Test passed'
      : `Test failed${result.reason ? `: ${result.reason}` : ''}`;
    try {
      await browser.execute('seetest:client.setReportStatus', status, message);
    } catch (e) {
      console.error('[Digital.ai] Failed to set report status:', e);
    }
  }
}

/**
 * Build a Digital.ai deviceQuery from the standard start_session params when an
 * explicit deviceQuery is not supplied. e.g. @os='android' and @version='14' and @name='.*Pixel.*'
 */
function buildDeviceQuery(platform: string, options: Record<string, unknown>): string | undefined {
  // Values are wrapped in single quotes in the query, so escape any single quotes they contain.
  const esc = (v: unknown): string => String(v).replace(/'/g, "\\'");
  const clauses: string[] = [`@os='${platform}'`];
  if (options.platformVersion) clauses.push(`@version='${esc(options.platformVersion)}'`);
  if (options.deviceName) clauses.push(`@name='${esc(options.deviceName)}'`);
  // Only os was inferred — not enough to target a device on its own.
  return clauses.length > 1 ? clauses.join(' and ') : undefined;
}

export const digitalAiProvider = new DigitalAiProvider();
