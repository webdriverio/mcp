import type { SessionProvider, ConnectionConfig } from './types';
import { buildIOSCapabilities, buildAndroidCapabilities, getAppiumServerConfig } from '../config/appium.config';

export type LocalAppiumOptions = {
  platform: 'iOS' | 'Android';
  appPath?: string;
  deviceName: string;
  platformVersion?: string;
  automationName?: string;
  appiumConfig?: { host?: string; port?: number; path?: string; protocol?: string };
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
    const appiumConfig = options.appiumConfig as { host?: string; port?: number; path?: string; protocol?: string } | undefined;
    return getAppiumServerConfig({
      hostname: appiumConfig?.host,
      port: appiumConfig?.port,
      path: appiumConfig?.path,
      protocol: appiumConfig?.protocol,
    });
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
