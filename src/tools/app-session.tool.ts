import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { localAppiumProvider } from '../providers/local-appium.provider';
import { registerSession } from '../session/lifecycle';
import type { SessionMetadata } from '../session/state';

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
    newCommandTimeout: z.number().min(0).optional().default(300).describe('How long (in seconds) Appium will wait for a new command before assuming the client has quit and ending the session. Default: 300.'),
    capabilities: z.record(z.string(), z.unknown()).optional().describe('Additional Appium/WebDriver capabilities to merge with defaults (e.g. appium:udid, appium:chromedriverExecutable, appium:autoWebview)'),
  },
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
  capabilities?: Record<string, unknown>;
}): Promise<CallToolResult> => {
  try {
    const { platform, appPath, deviceName, noReset } = args;

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
    const serverConfig = localAppiumProvider.getConnectionConfig(args);

    // Build platform-specific capabilities
    const mergedCapabilities = localAppiumProvider.buildCapabilities(args);

    // Create Appium session
    const browser = await remote({
      protocol: serverConfig.protocol,
      hostname: serverConfig.hostname,
      port: serverConfig.port,
      path: serverConfig.path,
      capabilities: mergedCapabilities,
    });

    const { sessionId } = browser;

    // Register session via lifecycle (handles transition sentinel, state maps, currentSession)
    const shouldAutoDetach = localAppiumProvider.shouldAutoDetach(args);
    const sessionType = localAppiumProvider.getSessionType(args);
    const metadata: SessionMetadata = {
      type: sessionType,
      capabilities: mergedCapabilities,
      isAttached: shouldAutoDetach,
    };
    registerSession(sessionId, browser, metadata, {
      sessionId,
      type: sessionType,
      startedAt: new Date().toISOString(),
      capabilities: mergedCapabilities,
      appiumConfig: { hostname: serverConfig.hostname, port: serverConfig.port, path: serverConfig.path },
      steps: [],
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
      isError: true,
      content: [{ type: 'text', text: `Error starting app session: ${e}` }],
    };
  }
};
