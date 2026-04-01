import { promisify } from 'node:util';
import { Local as BrowserstackTunnel } from 'browserstack-local';
import type { ConnectionConfig, SessionProvider, SessionResult } from '../types';

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

    const browserstackLocal = options.browserstackLocal as boolean | undefined;

    if (platform === 'browser') {
      const bstackOptions: Record<string, unknown> = {
        browserVersion: (options.browserVersion as string | undefined) ?? 'latest',
      };
      if (options.os) bstackOptions.os = options.os;
      if (options.osVersion) bstackOptions.osVersion = options.osVersion;
      if (browserstackLocal) bstackOptions.local = true;

      const reporting = options.reporting as { project?: string; build?: string; session?: string } | undefined;

      if (reporting?.project) bstackOptions.projectName = reporting.project;
      if (reporting?.build) bstackOptions.buildName = reporting.build;
      if (reporting?.session) bstackOptions.sessionName = reporting.session;

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
    if (browserstackLocal) bstackOptions.local = true;
    const reporting = options.reporting as { project?: string; build?: string; session?: string } | undefined;
    if (reporting?.project) bstackOptions.projectName = reporting.project;
    if (reporting?.build) bstackOptions.buildName = reporting.build;
    if (reporting?.session) bstackOptions.sessionName = reporting.session;

    const autoAcceptAlerts = options.autoAcceptAlerts as boolean | undefined;
    const autoDismissAlerts = options.autoDismissAlerts as boolean | undefined;

    return {
      platformName: platform,
      'appium:app': options.app,
      'appium:autoGrantPermissions': (options.autoGrantPermissions as boolean | undefined) ?? true,
      'appium:autoAcceptAlerts': autoDismissAlerts ? undefined : (autoAcceptAlerts ?? true),
      'appium:autoDismissAlerts': autoDismissAlerts,
      'appium:newCommandTimeout': (options.newCommandTimeout as number | undefined) ?? 300,
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

  async startTunnel(_options: Record<string, unknown>): Promise<unknown> {
    const key = process.env.BROWSERSTACK_ACCESS_KEY ?? '';
    const tunnel = new BrowserstackTunnel();
    const start = promisify(tunnel.start.bind(tunnel));
    try {
      await start({ key });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('another browserstack local client is running') || msg.includes('server is listening on port')) {
        console.error('[BrowserStack] Tunnel already running — reusing existing tunnel');
        return null;
      }
      throw e;
    }
    return tunnel;
  }

  async onSessionClose(
    sessionId: string,
    sessionType: 'browser' | 'ios' | 'android',
    result: SessionResult,
    tunnelHandle?: unknown,
  ): Promise<void> {
    if (tunnelHandle) {
      const tunnel = tunnelHandle as InstanceType<typeof BrowserstackTunnel>;
      const stop = promisify(tunnel.stop.bind(tunnel));
      await stop();
    }

    const user = process.env.BROWSERSTACK_USERNAME;
    const key = process.env.BROWSERSTACK_ACCESS_KEY;
    if (!user || !key) return;

    const baseUrl = sessionType === 'browser'
      ? 'https://api.browserstack.com/automate/sessions'
      : 'https://api-cloud.browserstack.com/app-automate/sessions';

    const auth = Buffer.from(`${user}:${key}`).toString('base64');
    const body: Record<string, string> = { status: result.status, ...(result.reason ? { reason: result.reason } : {}) };
    await fetch(`${baseUrl}/${sessionId}.json`, {
      method: 'PUT',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

export const browserStackProvider = new BrowserStackProvider();
