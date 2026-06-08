import { basicAuth } from '../../utils/auth';
import type { ConnectionConfig, SessionProvider, SessionResult } from '../types';
import type { Browser as WdioBrowser } from 'webdriverio';
import testingbotTunnel from 'testingbot-tunnel-launcher';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class TestingBotProvider implements SessionProvider {
  name = 'testingbot';

  getConnectionConfig(_options: Record<string, unknown>): ConnectionConfig {
    // TestingBot uses a single hub for both browser and mobile (Appium) sessions.
    return {
      protocol: 'https',
      hostname: 'hub.testingbot.com',
      port: 443,
      path: '/wd/hub',
      user: process.env.TESTINGBOT_KEY,
      key: process.env.TESTINGBOT_SECRET,
    };
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const platform = options.platform as string;
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};
    const tunnel = (options.tunnel ?? options.testingbotLocal) as boolean | string | undefined;
    const reporting = options.reporting as { project?: string; build?: string; session?: string } | undefined;

    const tbOptions: Record<string, unknown> = {};

    if (reporting?.build) tbOptions.build = reporting.build;
    if (reporting?.session) tbOptions.name = reporting.session;
    else if (reporting?.project) tbOptions.name = reporting.project;

    if (tunnel) {
      tbOptions.tunnel = true;
      if (options.tunnelName) tbOptions.tunnelIdentifier = options.tunnelName;
    }

    if (platform === 'browser') {
      return {
        ...userCapabilities,
        browserName: (options.browser as string | undefined) ?? 'chrome',
        browserVersion: (options.browserVersion as string | undefined) ?? 'latest',
        platformName: options.os ? [options.os as string, options.osVersion as string | undefined].filter(Boolean).join(' ') : 'Windows 11',
        'tb:options': tbOptions,
      };
    }

    // Mobile (ios / android)
    const mobileBrowser = options.browser as string | undefined;

    // Mobile browser/emulator mode (e.g. Chrome on Android emulator)
    if (mobileBrowser) {
      const caps: Record<string, unknown> = {
        platformName: platform,
        browserName: mobileBrowser,
        'appium:deviceName': options.deviceName,
        'appium:platformVersion': options.platformVersion,
        'appium:automationName': (options.automationName as string | undefined) ?? (platform === 'ios' ? 'XCUITest' : 'UiAutomator2'),
        'appium:newCommandTimeout': (options.newCommandTimeout as number | undefined) ?? 300,
        'tb:options': tbOptions,
      };
      return { ...userCapabilities, ...caps };
    }

    // Mobile native app mode
    const autoAcceptAlerts = options.autoAcceptAlerts as boolean | undefined;
    const autoDismissAlerts = options.autoDismissAlerts as boolean | undefined;

    const caps: Record<string, unknown> = {
      platformName: platform,
      'appium:app': options.app,
      'appium:deviceName': options.deviceName,
      'appium:platformVersion': options.platformVersion,
      'appium:automationName': (options.automationName as string | undefined) ?? (platform === 'ios' ? 'XCUITest' : 'UiAutomator2'),
      'appium:autoGrantPermissions': (options.autoGrantPermissions as boolean | undefined) ?? true,
      'appium:autoAcceptAlerts': autoDismissAlerts ? undefined : (autoAcceptAlerts ?? true),
      'appium:autoDismissAlerts': autoDismissAlerts,
      'appium:newCommandTimeout': (options.newCommandTimeout as number | undefined) ?? 300,
      'tb:options': tbOptions,
    };

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

  async startTunnel(options: Record<string, unknown>): Promise<unknown> {
    const tunnelName = (options.tunnelName as string | undefined) ?? `wdio-mcp-testingbot-${Date.now()}`;
    const logfile = join(tmpdir(), 'testingbot-tunnel.log');
    console.error(`[TestingBot] Starting tunnel "${tunnelName}"`);
    try {
      const tunnel = await testingbotTunnel.downloadAndRunAsync({
        apiKey: process.env.TESTINGBOT_KEY ?? '',
        apiSecret: process.env.TESTINGBOT_SECRET ?? '',
        tunnelIdentifier: tunnelName,
        logfile,
      });
      console.error(`[TestingBot] Tunnel started: "${tunnelName}"`);
      return tunnel;
    } catch (e: unknown) {
      const msg = (e !== null && typeof e === 'object' ? (e as { message?: string }).message : undefined) ?? String(e);
      if (msg.includes('already running') || msg.includes('another tunnel') || msg.includes('already in use')) {
        console.error('[TestingBot] Tunnel already running — reusing existing tunnel');
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
    _region?: string,
  ): Promise<void> {
    const key = process.env.TESTINGBOT_KEY;
    const secret = process.env.TESTINGBOT_SECRET;
    if (!key || !secret) return;

    // The :id route accepts the WebDriver session UUID for both web and mobile.
    try {
      const auth = basicAuth(key, secret);
      const params = new URLSearchParams();
      params.set('test[success]', result.status === 'passed' ? '1' : '0');
      if (result.reason) params.set('test[status_message]', result.reason);
      const apiUrl = `https://api.testingbot.com/v1/tests/${sessionId}`;
      console.error(`[TestingBot] Setting test status for ${sessionId}: ${result.status}`);
      const res = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      if (res.ok) {
        console.error('[TestingBot] Test status set successfully via REST API');
      } else {
        const resBody = await res.text();
        console.error(`[TestingBot] Failed to set test status: HTTP ${res.status} — ${resBody}`);
      }
    } catch (e) {
      console.error('[TestingBot] Failed to set test status via REST API:', e);
    }
  }

  async stopTunnel(tunnelHandle?: unknown): Promise<void> {
    if (!tunnelHandle) return;
    const close = (tunnelHandle as { close?: (cb: () => void) => void }).close;
    if (typeof close !== 'function') {
      console.error('[TestingBot] Tunnel handle has no close() method — skipping stop');
      return;
    }
    await new Promise<void>((resolve) => close(() => resolve()));
  }
}

export const testingBotProvider = new TestingBotProvider();
