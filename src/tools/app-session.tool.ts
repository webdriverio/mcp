import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { buildAndroidCapabilities, buildIOSCapabilities, getAppiumServerConfig, } from '../config/appium.config';
import { getBrowser } from './browser.tool';

export const startAppToolDefinition: ToolDefinition = {
  name: 'start_app_session',
  description: 'starts a mobile app session (iOS/Android) via Appium',
  inputSchema: {
    platform: z.enum(['iOS', 'Android']).describe('Mobile platform'),
    appPath: z.string().optional().describe('Path to the app file (.app/.apk/.ipa). Required unless noReset=true (connecting to already-running app)'),
    deviceName: z.string().describe('Device/emulator/simulator name'),
    platformVersion: z.string().optional().describe('OS version (e.g., "17.0", "14")'),
    automationName: z
      .enum(['XCUITest', 'UiAutomator2', 'Espresso'])
      .optional()
      .describe('Automation driver name'),
    appiumHost: z.string().optional().describe('Appium server hostname (overrides APPIUM_URL env var)'),
    appiumPort: z.number().optional().describe('Appium server port (overrides APPIUM_URL_PORT env var)'),
    appiumPath: z.string().optional().describe('Appium server path (overrides APPIUM_PATH env var)'),
    autoGrantPermissions: z.boolean().optional().describe('Auto-grant app permissions (default: true)'),
    autoAcceptAlerts: z.boolean().optional().describe('Auto-accept alerts (default: true)'),
    autoDismissAlerts: z.boolean().optional().describe('Auto-dismiss alerts (default: false, will override "autoAcceptAlerts" to undefined if set)'),
    appWaitActivity: z.string().optional().describe('Activity to wait for on launch (Android only)'),
    udid: z.string().optional().describe('Unique Device Identifier for iOS real device testing (e.g., "00008030-001234567890002E")'),
    noReset: z.boolean().optional().describe('Do not reset app state before session (preserves app data). Default: false'),
    fullReset: z.boolean().optional().describe('Uninstall app before/after session. Default: true. Set to false with noReset=true to preserve app state completely'),
    newCommandTimeout: z.number().min(0).optional().describe('How long (in seconds) Appium will wait for a new command before assuming the client has quit and ending the session. Default: 60. Set to 300 for 5 minutes, etc.'),
  },
};

// Access shared state from browser.tool.ts
export const getState = () => {
  const sharedState = (getBrowser as any).__state;
  if (!sharedState) {
    throw new Error('Browser state not initialized');
  }
  return sharedState as {
    browsers: Map<string, WebdriverIO.Browser>;
    currentSession: string | null;
    sessionMetadata: Map<string, { type: 'browser' | 'ios' | 'android'; capabilities: any; isAttached: boolean }>;
  };
};

export const startAppTool: ToolCallback = async (args: {
  platform: 'iOS' | 'Android';
  appPath?: string;
  deviceName: string;
  platformVersion?: string;
  automationName?: 'XCUITest' | 'UiAutomator2' | 'Espresso';
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
}): Promise<CallToolResult> => {
  try {
    const {
      platform,
      appPath,
      deviceName,
      platformVersion,
      automationName,
      appiumHost,
      appiumPort,
      appiumPath,
      autoGrantPermissions = true,
      autoAcceptAlerts,
      autoDismissAlerts,
      appWaitActivity,
      udid,
      noReset,
      fullReset,
      newCommandTimeout,
    } = args;

    // Validate: either appPath or noReset=true is required
    if (!appPath && noReset !== true) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Either "appPath" must be provided to install an app, or "noReset: true" must be set to connect to an already-running app.',
        }],
      };
    }

    // Get Appium server configuration
    const serverConfig = getAppiumServerConfig({
      hostname: appiumHost,
      port: appiumPort,
      path: appiumPath,
    });

    // Build platform-specific capabilities
    const capabilities: Record<string, any> = platform === 'iOS'
      ? buildIOSCapabilities(appPath, {
        deviceName,
        platformVersion,
        automationName: (automationName as 'XCUITest') || 'XCUITest',
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
        automationName: (automationName as 'UiAutomator2' | 'Espresso') || 'UiAutomator2',
        autoGrantPermissions,
        autoAcceptAlerts,
        autoDismissAlerts,
        appWaitActivity,
        noReset,
        fullReset,
        newCommandTimeout,
      });

    // Create Appium session
    const browser = await remote({
      protocol: 'http',
      hostname: serverConfig.hostname,
      port: serverConfig.port,
      path: serverConfig.path,
      capabilities,
    });

    const { sessionId } = browser;

    // Store session and metadata
    // Auto-set isAttached=true when noReset or no appPath to preserve session on close
    const shouldAutoDetach = noReset === true || !appPath;
    const state = getState();
    state.browsers.set(sessionId, browser);
    state.currentSession = sessionId;
    state.sessionMetadata.set(sessionId, {
      type: platform.toLowerCase() as 'ios' | 'android',
      capabilities,
      isAttached: shouldAutoDetach,
    });

    const appInfo = appPath ? `\nApp: ${appPath}` : '\nApp: (connected to running app)';
    const detachNote = shouldAutoDetach
      ? '\n\n(Auto-detach enabled: session will be preserved on close. Use close_session({ detach: false }) to force terminate.)'
      : '';
    return {
      content: [
        {
          type: 'text',
          text: `${platform} app session started with sessionId: ${sessionId}\nDevice: ${deviceName}${appInfo}\nAppium Server: ${serverConfig.hostname}:${serverConfig.port}${serverConfig.path}${detachNote}`,
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error starting app session: ${e}` }],
    };
  }
};

