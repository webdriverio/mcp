/**
 * Appium server configuration and capability builders
 */

export interface AppiumServerConfig {
  hostname: string;
  port: number;
  path: string;
}

export interface IOSCapabilityOptions {
  deviceName: string;
  platformVersion?: string;
  automationName?: 'XCUITest';
  autoGrantPermissions?: boolean;
  autoAcceptAlerts?: boolean;
  autoDismissAlerts?: boolean;
  udid?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;

  [key: string]: any;
}

export interface AndroidCapabilityOptions {
  deviceName: string;
  platformVersion?: string;
  automationName?: 'UiAutomator2' | 'Espresso';
  autoGrantPermissions?: boolean;
  autoAcceptAlerts?: boolean;
  autoDismissAlerts?: boolean;
  appWaitActivity?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;

  [key: string]: any;
}

/**
 * Get Appium server configuration from environment variables or defaults
 */
export function getAppiumServerConfig(overrides?: Partial<AppiumServerConfig>): AppiumServerConfig {
  return {
    hostname: overrides?.hostname || process.env.APPIUM_URL || '127.0.0.1',
    port: overrides?.port || Number(process.env.APPIUM_URL_PORT) || 4723,
    path: overrides?.path || process.env.APPIUM_PATH || '/',
  };
}

/**
 * Build iOS capabilities for Appium session
 */
export function buildIOSCapabilities(
  appPath: string | undefined,
  options: IOSCapabilityOptions,
): Record<string, any> {
  const capabilities: Record<string, any> = {
    platformName: 'iOS',
    'appium:platformVersion': options.platformVersion,
    'appium:deviceName': options.deviceName,
    'appium:automationName': options.automationName || 'XCUITest',
  };

  // Only set app path if provided (allows connecting to already-running app)
  if (appPath) {
    capabilities['appium:app'] = appPath;
  }

  // Set UDID for real device testing (required for physical iOS devices)
  if (options.udid) {
    capabilities['appium:udid'] = options.udid;
  }

  // Set reset behavior (for preserving app state)
  if (options.noReset !== undefined) {
    capabilities['appium:noReset'] = options.noReset;
  }
  if (options.fullReset !== undefined) {
    capabilities['appium:fullReset'] = options.fullReset;
  }

  // Set session timeout (how long Appium waits for new commands)
  if (options.newCommandTimeout !== undefined) {
    capabilities['appium:newCommandTimeout'] = options.newCommandTimeout;
  }

  capabilities['appium:autoGrantPermissions'] = options.autoGrantPermissions ?? true;
  capabilities['appium:autoAcceptAlerts'] = options.autoAcceptAlerts ?? true;

  if (options.autoDismissAlerts !== undefined) {
    capabilities['appium:autoDismissAlerts'] = options.autoDismissAlerts;
    capabilities['appium:autoAcceptAlerts'] = undefined;
  }

  // Add any additional custom options
  for (const [key, value] of Object.entries(options)) {
    if (
      !['deviceName', 'platformVersion', 'automationName', 'autoAcceptAlerts', 'autoDismissAlerts', 'udid', 'noReset', 'fullReset', 'newCommandTimeout'].includes(
        key,
      )
    ) {
      capabilities[`appium:${key}`] = value;
    }
  }

  return capabilities;
}

/**
 * Build Android capabilities for Appium session
 */
export function buildAndroidCapabilities(
  appPath: string | undefined,
  options: AndroidCapabilityOptions,
): Record<string, any> {
  const capabilities: Record<string, any> = {
    platformName: 'Android',
    'appium:platformVersion': options.platformVersion,
    'appium:deviceName': options.deviceName,
    'appium:automationName': options.automationName || 'UiAutomator2',
  };

  // Only set app path if provided (allows connecting to already-running app)
  if (appPath) {
    capabilities['appium:app'] = appPath;
  }

  // Set reset behavior (for preserving app state)
  if (options.noReset !== undefined) {
    capabilities['appium:noReset'] = options.noReset;
  }
  if (options.fullReset !== undefined) {
    capabilities['appium:fullReset'] = options.fullReset;
  }

  // Set session timeout (how long Appium waits for new commands)
  if (options.newCommandTimeout !== undefined) {
    capabilities['appium:newCommandTimeout'] = options.newCommandTimeout;
  }

  // Optional Android-specific settings
  capabilities['appium:autoGrantPermissions'] = options.autoGrantPermissions ?? true;
  capabilities['appium:autoAcceptAlerts'] = options.autoAcceptAlerts ?? true;

  if (options.autoDismissAlerts !== undefined) {
    capabilities['appium:autoDismissAlerts'] = options.autoDismissAlerts;
    capabilities['appium:autoAcceptAlerts'] = undefined;
  }

  if (options.appWaitActivity) {
    capabilities['appium:appWaitActivity'] = options.appWaitActivity;
  }

  // Add any additional custom options
  for (const [key, value] of Object.entries(options)) {
    if (
      !['deviceName', 'platformVersion', 'automationName', 'autoGrantPermissions', 'appWaitActivity', 'noReset', 'fullReset', 'newCommandTimeout'].includes(
        key,
      )
    ) {
      capabilities[`appium:${key}`] = value;
    }
  }

  return capabilities;
}
