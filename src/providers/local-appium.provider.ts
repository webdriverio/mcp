import type { SessionProvider, ConnectionConfig } from './types';
import { buildIOSCapabilities, buildAndroidCapabilities, getAppiumServerConfig } from '../config/appium.config';

export type LocalAppiumOptions = {
  platform: 'iOS' | 'Android';
  appPath?: string;
  deviceName: string;
  platformVersion?: string;
  automationName?: string;
  appiumHost?: string;
  appiumPort?: number;
  appiumPath?: string;
  autoGrantPermissions?: boolean;
  autoAcceptAlerts?: boolean;
  autoDismissAlerts?: boolean;
  appWaitActivity?: string;
  udid?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;
  capabilities?: Record<string, unknown>;
};

export class LocalAppiumProvider implements SessionProvider {
  name = 'local-appium';

  getConnectionConfig(options: Record<string, unknown>): ConnectionConfig {
    const config = getAppiumServerConfig({
      hostname: options.appiumHost as string | undefined,
      port: options.appiumPort as number | undefined,
      path: options.appiumPath as string | undefined,
    });
    return { protocol: 'http', ...config };
  }

  buildCapabilities(options: Record<string, unknown>): Record<string, unknown> {
    const platform = options.platform as string;
    const appPath = options.appPath as string | undefined;
    const deviceName = options.deviceName as string;
    const platformVersion = options.platformVersion as string | undefined;
    const autoGrantPermissions = options.autoGrantPermissions as boolean | undefined;
    const autoAcceptAlerts = options.autoAcceptAlerts as boolean | undefined;
    const autoDismissAlerts = options.autoDismissAlerts as boolean | undefined;
    const udid = options.udid as string | undefined;
    const noReset = options.noReset as boolean | undefined;
    const fullReset = options.fullReset as boolean | undefined;
    const newCommandTimeout = options.newCommandTimeout as number | undefined;
    const appWaitActivity = options.appWaitActivity as string | undefined;
    const userCapabilities = (options.capabilities as Record<string, unknown> | undefined) ?? {};

    const capabilities: Record<string, any> = platform === 'iOS'
      ? buildIOSCapabilities(appPath, {
        deviceName,
        platformVersion,
        automationName: (options.automationName as 'XCUITest') || 'XCUITest',
        autoGrantPermissions,
        autoAcceptAlerts,
        autoDismissAlerts,
        udid,
        noReset,
        fullReset,
        newCommandTimeout,
      })
      : buildAndroidCapabilities(appPath, {
        deviceName,
        platformVersion,
        automationName: (options.automationName as 'UiAutomator2' | 'Espresso') || 'UiAutomator2',
        autoGrantPermissions,
        autoAcceptAlerts,
        autoDismissAlerts,
        appWaitActivity,
        noReset,
        fullReset,
        newCommandTimeout,
      });

    const mergedCapabilities = {
      ...capabilities,
      ...userCapabilities,
    };

    for (const [key, value] of Object.entries(mergedCapabilities)) {
      if (value === undefined) {
        delete mergedCapabilities[key];
      }
    }

    return mergedCapabilities;
  }

  getSessionType(options: Record<string, unknown>): 'ios' | 'android' {
    const platform = options.platform as string;
    return platform.toLowerCase() as 'ios' | 'android';
  }

  shouldAutoDetach(options: Record<string, unknown>): boolean {
    return options.noReset === true || !options.appPath;
  }
}

export const localAppiumProvider = new LocalAppiumProvider();
