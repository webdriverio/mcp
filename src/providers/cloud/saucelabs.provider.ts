import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { basicAuth } from '../../utils/auth';
import type { ConnectionConfig, SessionProvider, SessionResult } from '../types';
import type { Browser as WdioBrowser } from 'webdriverio';

export class SauceLabsProvider implements SessionProvider {
  name = 'saucelabs';

  private resolveRegion(options: Record<string, unknown>): string {
    return (options.region as string | undefined) ?? 'eu-central-1';
  }

  getConnectionConfig(options: Record<string, unknown>): ConnectionConfig {
    const region = this.resolveRegion(options);
    return {
      protocol: 'https',
      hostname: `ondemand.${region}.saucelabs.com`,
      port: 443,
      path: '/wd/hub',
      user: process.env.SAUCE_USERNAME,
      key: process.env.SAUCE_ACCESS_KEY,
    };
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const platform = options.platform as string;
    const region = this.resolveRegion(options);
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};
    const saucelabsLocal = (options.tunnel ?? options.saucelabsLocal) as boolean | string | undefined;
    const reporting = options.reporting as { project?: string; build?: string; session?: string } | undefined;

    const sauceOptions: Record<string, unknown> = { region };

    if (reporting?.build) sauceOptions.build = reporting.build;
    if (reporting?.session) sauceOptions.name = reporting.session;
    else if (reporting?.project) sauceOptions.name = reporting.project;

    if (saucelabsLocal) {
      sauceOptions.tunnel = true;
      if (saucelabsLocal === 'external') {
        sauceOptions.tunnelIdentifier = process.env.SAUCE_TUNNEL_ID ?? 'mcp-tunnel';
      }
    }

    if (platform === 'browser') {
      return {
        browserName: (options.browser as string | undefined) ?? 'chrome',
        browserVersion: (options.browserVersion as string | undefined) ?? 'latest',
        platformName: (options.os as string | undefined) ?? 'Linux',
        'sauce:options': sauceOptions,
        ...userCapabilities,
      };
    }

    // Mobile (ios / android)
    const mobileBrowser = options.browser as string | undefined;

    // Mobile browser/emulator mode (e.g. Chrome on Android emulator)
    if (mobileBrowser) {
      sauceOptions.appiumVersion = '2.11.0';
      if (options.deviceOrientation) sauceOptions.deviceOrientation = options.deviceOrientation;

      const caps: Record<string, unknown> = {
        platformName: platform,
        browserName: mobileBrowser,
        'appium:deviceName': options.deviceName,
        'appium:platformVersion': options.platformVersion,
        'appium:automationName': (options.automationName as string | undefined) ?? 'UiAutomator2',
        'appium:newCommandTimeout': (options.newCommandTimeout as number | undefined) ?? 300,
        'sauce:options': sauceOptions,
      };
      return { ...caps, ...userCapabilities };
    }

    // Mobile native app mode
    sauceOptions.appiumVersion = 'latest';

    const autoAcceptAlerts = options.autoAcceptAlerts as boolean | undefined;
    const autoDismissAlerts = options.autoDismissAlerts as boolean | undefined;

    return {
      platformName: platform,
      'appium:app': options.app,
      'appium:deviceName': options.deviceName,
      'appium:platformVersion': options.platformVersion,
      'appium:automationName': (options.automationName as string | undefined) ?? 'UiAutomator2',
      'appium:autoGrantPermissions': (options.autoGrantPermissions as boolean | undefined) ?? true,
      'appium:autoAcceptAlerts': autoDismissAlerts ? undefined : (autoAcceptAlerts ?? true),
      'appium:autoDismissAlerts': autoDismissAlerts,
      'appium:newCommandTimeout': (options.newCommandTimeout as number | undefined) ?? 300,
      'sauce:options': sauceOptions,
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

  async startTunnel(options: Record<string, unknown>): Promise<unknown> {
    const region = this.resolveRegion(options);
    const logFile = join(tmpdir(), 'sauce-connect.log');
    console.error(`[SauceLabs] Starting tunnel, log: ${logFile}`);
    try {
      process.env.SAUCE_API_HOST = `api.${region}.saucelabs.com`;
      const { default: sauceConnectLauncher } = await import('sauce-connect-launcher');
      const start = promisify(sauceConnectLauncher);
      const sc = await start({
        logfile: logFile,
        verbose: true,
        logger: (msg: string) => console.error(`[SauceConnect] ${msg}`),
      });
      return sc;
    } catch (e: unknown) {
      const msg = (e !== null && typeof e === 'object' ? (e as { message?: string }).message : undefined) ?? String(e);
      if (msg.includes('already running') || msg.includes('another instance')) {
        console.error('[SauceLabs] Tunnel already running — reusing existing tunnel');
        return null;
      }
      throw e;
    }
  }

  async onSessionClose(
    sessionId: string,
    _sessionType: 'browser' | 'ios' | 'android',
    result: SessionResult,
    _tunnelHandle?: unknown,
    _browser?: WdioBrowser,
    region?: string,
  ): Promise<void> {
    const effectiveRegion = region ?? 'eu-central-1';
    const user = process.env.SAUCE_USERNAME;
    const key = process.env.SAUCE_ACCESS_KEY;
    if (user && key) {
      try {
        const auth = basicAuth(user, key);
        const body: Record<string, boolean> = { passed: result.status === 'passed' };
        const apiUrl = `https://api.${effectiveRegion}.saucelabs.com/rest/v1/${user}/jobs/${sessionId}`;
        console.error(`[SauceLabs] Setting job status for ${sessionId}: ${result.status}`);
        await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        console.error('[SauceLabs] Job result set successfully via REST API');
      } catch (e) {
        console.error('[SauceLabs] Failed to set job result via REST API:', e);
      }
    }
  }

  async stopTunnel(tunnelHandle?: unknown): Promise<void> {
    if (tunnelHandle) {
      const sc = tunnelHandle as { close: (cb: (err?: Error) => void) => void };
      const stop = promisify(sc.close.bind(sc));
      await stop();
    }
  }
}

export const sauceLabsProvider = new SauceLabsProvider();
