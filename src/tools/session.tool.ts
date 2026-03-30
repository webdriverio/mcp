import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import type { SessionMetadata } from '../session/state';
import { getBrowser, getState } from '../session/state';
import { closeSession, registerSession } from '../session/lifecycle';
import { getProvider } from '../providers/registry';
import { coerceBoolean } from '../utils/zod-helpers';

const platformEnum = z.enum(['browser', 'ios', 'android']);
const browserEnum = z.enum(['chrome', 'firefox', 'edge', 'safari']);
const automationEnum = z.enum(['XCUITest', 'UiAutomator2']);

export const startSessionToolDefinition: ToolDefinition = {
  name: 'start_session',
  description: 'Starts a browser or mobile app session. For local browser, use browser platform. For mobile apps, use ios or android platform. Use attach mode to connect to an existing Chrome instance.',
  inputSchema: {
    provider: z.enum(['local', 'browserstack']).optional().default('local').describe('Session provider (default: local)'),
    platform: platformEnum.describe('Session platform type'),
    browser: browserEnum.optional().describe('Browser to launch (required for browser platform)'),
    browserVersion: z.string().optional().describe('Browser version (BrowserStack only, default: latest)'),
    os: z.string().optional().describe('Operating system (BrowserStack browser only, e.g. "Windows", "OS X")'),
    osVersion: z.string().optional().describe('OS version (BrowserStack browser only, e.g. "11", "Sequoia")'),
    app: z.string().optional().describe('BrowserStack app URL (bs://...) or custom_id for mobile sessions'),
    reporting: z.object({
      project: z.string().optional(),
      build: z.string().optional(),
      session: z.string().optional(),
    }).optional().describe('BrowserStack reporting labels (project, build, session)'),
    headless: coerceBoolean.optional().default(true).describe('Run browser in headless mode (default: true)'),
    windowWidth: z.number().min(400).max(3840).optional().default(1920).describe('Browser window width'),
    windowHeight: z.number().min(400).max(2160).optional().default(1080).describe('Browser window height'),
    deviceName: z.string().optional().describe('Mobile device/emulator/simulator name (required for ios/android)'),
    platformVersion: z.string().optional().describe('OS version (e.g., "17.0", "14")'),
    appPath: z.string().optional().describe('Path to app file (.app/.apk/.ipa)'),
    automationName: automationEnum.optional().describe('Automation driver'),
    autoGrantPermissions: coerceBoolean.optional().describe('Auto-grant app permissions (default: true)'),
    autoAcceptAlerts: coerceBoolean.optional().describe('Auto-accept alerts (default: true)'),
    autoDismissAlerts: coerceBoolean.optional().describe('Auto-dismiss alerts (default: false)'),
    appWaitActivity: z.string().optional().describe('Activity to wait for on Android launch'),
    udid: z.string().optional().describe('Unique Device Identifier for iOS real device'),
    noReset: coerceBoolean.optional().describe('Preserve app data between sessions'),
    fullReset: coerceBoolean.optional().describe('Uninstall app before/after session'),
    newCommandTimeout: z.number().min(0).optional().default(300).describe('Appium command timeout in seconds'),
    attach: coerceBoolean.optional().default(false).describe('Attach to existing Chrome instead of launching'),
    attachConfig: z.object({
      port: z.number().optional().default(9222),
      host: z.string().optional().default('localhost'),
    }).optional().describe('Chrome remote debugging connection (attach mode only, defaults: port 9222, host localhost)'),
    appiumConfig: z.object({
      host: z.string().optional(),
      port: z.number().optional(),
      path: z.string().optional(),
    }).optional().describe('Appium server connection (local provider only)'),
    browserstackLocal: coerceBoolean.optional().default(false).describe('Enable BrowserStack Local tunnel for testing against local/internal URLs (BrowserStack only, default: false). IMPORTANT: The BrowserStack Local binary daemon MUST already be running before calling start_session, otherwise all navigation to local/internal URLs will fail with ERR_TUNNEL_CONNECTION_FAILED. Read the wdio://browserstack/local-binary resource for the platform-specific download URL and the exact daemon start command. Do not set this to true without first confirming the daemon is running.'),
    navigationUrl: z.string().optional().describe('URL to navigate to after starting'),
    capabilities: z.record(z.string(), z.unknown()).optional().describe('Additional capabilities to merge'),
  },
};

type StartSessionArgs = {
  provider?: 'local' | 'browserstack';
  platform: 'browser' | 'ios' | 'android';
  browser?: 'chrome' | 'firefox' | 'edge' | 'safari';
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  app?: string;
  reporting?: { project?: string; build?: string; session?: string };
  headless?: boolean;
  windowWidth?: number;
  windowHeight?: number;
  deviceName?: string;
  platformVersion?: string;
  appPath?: string;
  automationName?: 'XCUITest' | 'UiAutomator2';
  autoGrantPermissions?: boolean;
  autoAcceptAlerts?: boolean;
  autoDismissAlerts?: boolean;
  appWaitActivity?: string;
  udid?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;
  attach?: boolean;
  attachConfig?: { port?: number; host?: string };
  appiumConfig?: { host?: string; port?: number; path?: string };
  browserstackLocal?: boolean;
  navigationUrl?: string;
  capabilities?: Record<string, unknown>;
};

export const closeSessionToolDefinition: ToolDefinition = {
  name: 'close_session',
  description: 'Closes or detaches from the current browser or app session',
  inputSchema: {
    detach: coerceBoolean.optional().describe('If true, disconnect without terminating (preserves app state). Default: false'),
  },
};

type TabSnapshot = { activeTabUrl: string | undefined; allTabUrls: string[] };

async function closeStaleMappers(host: string, port: number): Promise<TabSnapshot> {
  try {
    const res = await fetch(`http://${host}:${port}/json`);
    const targets = await res.json() as { id: string; title: string; type: string; url: string }[];
    const mappers = targets.filter((t) => t.title?.includes('BiDi'));
    await Promise.all(mappers.map((t) => fetch(`http://${host}:${port}/json/close/${t.id}`)));
    const pages = targets.filter((t) => t.type === 'page' && !t.title?.includes('BiDi'));
    return { activeTabUrl: pages[0]?.url, allTabUrls: pages.map((t) => t.url) };
  } catch {
    return { activeTabUrl: undefined, allTabUrls: [] };
  }
}

async function restoreAndSwitchToActiveTab(browser: WebdriverIO.Browser, activeTabUrl: string, allTabUrls: string[]): Promise<void> {
  const handles = await browser.getWindowHandles();
  const currentUrls: string[] = [];
  for (const handle of handles) {
    await browser.switchToWindow(handle);
    currentUrls.push(await browser.getUrl());
  }

  const missingUrls = allTabUrls.filter((u) => !currentUrls.includes(u));
  let missingIdx = 0;
  for (let i = 0; i < handles.length; i++) {
    if (currentUrls[i] === 'about:blank' && missingIdx < missingUrls.length) {
      await browser.switchToWindow(handles[i]);
      await browser.url(missingUrls[missingIdx]);
      currentUrls[i] = missingUrls[missingIdx++];
    }
  }

  for (let i = 0; i < handles.length; i++) {
    if (currentUrls[i] === activeTabUrl) {
      await browser.switchToWindow(handles[i]);
      break;
    }
  }
}

async function waitForCDP(host: string, port: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host}:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Chrome did not expose CDP on ${host}:${port} within ${timeoutMs}ms`);
}

async function startBrowserSession(args: StartSessionArgs): Promise<CallToolResult> {
  const {
    browser = 'chrome',
    headless = true,
    windowWidth = 1920,
    windowHeight = 1080,
    navigationUrl,
    capabilities: userCapabilities = {},
  } = args;

  const browserDisplayNames: Record<string, string> = {
    chrome: 'Chrome',
    firefox: 'Firefox',
    edge: 'Edge',
    safari: 'Safari',
  };

  const headlessSupported = browser !== 'safari';
  const effectiveHeadless = headless && headlessSupported;

  const provider = getProvider(args.provider ?? 'local', 'browser');
  const connectionConfig = provider.getConnectionConfig(args as Record<string, unknown>);
  const mergedCapabilities = provider.buildCapabilities({
    ...args as Record<string, unknown>,
    browser,
    headless,
    windowWidth,
    windowHeight,
    capabilities: userCapabilities,
  });

  const wdioBrowser = await remote({ ...connectionConfig, capabilities: mergedCapabilities });
  const { sessionId } = wdioBrowser;

  const sessionMetadata: SessionMetadata = {
    type: 'browser',
    capabilities: mergedCapabilities,
    isAttached: false,
  };

  registerSession(sessionId, wdioBrowser, sessionMetadata, {
    sessionId,
    type: 'browser',
    startedAt: new Date().toISOString(),
    capabilities: mergedCapabilities,
    steps: [],
  });

  let sizeNote = '';
  try {
    await wdioBrowser.setWindowSize(windowWidth, windowHeight);
  } catch (e) {
    sizeNote = `\nNote: Unable to set window size (${windowWidth}x${windowHeight}). ${e}`;
  }

  if (navigationUrl) {
    await wdioBrowser.url(navigationUrl);
  }

  const modeText = effectiveHeadless ? 'headless' : 'headed';
  const urlText = navigationUrl ? ` and navigated to ${navigationUrl}` : '';
  const headlessNote = headless && !headlessSupported
    ? '\nNote: Safari does not support headless mode. Started in headed mode.'
    : '';

  return {
    content: [{
      type: 'text',
      text: `${browserDisplayNames[browser]} browser started in ${modeText} mode with sessionId: ${sessionId} (${windowWidth}x${windowHeight})${urlText}${headlessNote}${sizeNote}`,
    }],
  };
}

async function startMobileSession(args: StartSessionArgs): Promise<CallToolResult> {
  const { platform, appPath, app, deviceName, noReset } = args;

  if (!appPath && !app && noReset !== true) {
    return {
      content: [{
        type: 'text',
        text: 'Error: Either "appPath" must be provided to install an app, or "noReset: true" must be set to connect to an already-running app.',
      }],
    };
  }

  const provider = getProvider(args.provider ?? 'local', args.platform);
  const serverConfig = provider.getConnectionConfig(args as Record<string, unknown>);
  const mergedCapabilities = provider.buildCapabilities(args as Record<string, unknown>);

  const browser = await remote({ ...serverConfig, capabilities: mergedCapabilities });

  const { sessionId } = browser;
  const shouldAutoDetach = provider.shouldAutoDetach(args as Record<string, unknown>);
  const sessionType = provider.getSessionType(args as Record<string, unknown>);
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
}

async function attachBrowserSession(args: StartSessionArgs): Promise<CallToolResult> {
  const { port = 9222, host = 'localhost' } = args.attachConfig ?? {};
  const { navigationUrl } = args;

  await waitForCDP(host, port);
  const { activeTabUrl, allTabUrls } = await closeStaleMappers(host, port);

  const capabilities = {
    browserName: 'chrome',
    unhandledPromptBehavior: 'dismiss',
    webSocketUrl: false,
    'goog:chromeOptions': {
      debuggerAddress: `${host}:${port}`,
    },
  };

  const browser = await remote({
    connectionRetryTimeout: 30000,
    connectionRetryCount: 3,
    capabilities,
  });

  const { sessionId } = browser;

  const sessionMetadata: SessionMetadata = {
    type: 'browser',
    capabilities,
    isAttached: true,
  };

  registerSession(sessionId, browser, sessionMetadata, {
    sessionId,
    type: 'browser',
    startedAt: new Date().toISOString(),
    capabilities,
    steps: [],
  });

  if (navigationUrl) {
    await browser.url(navigationUrl);
  } else if (activeTabUrl) {
    await restoreAndSwitchToActiveTab(browser, activeTabUrl, allTabUrls);
  }

  const title = await browser.getTitle();
  const url = await browser.getUrl();

  return {
    content: [{
      type: 'text',
      text: `Attached to Chrome on ${host}:${port}\nSession ID: ${sessionId}\nCurrent page: "${title}" (${url})`,
    }],
  };
}

export const startSessionTool: ToolCallback = async (args: StartSessionArgs): Promise<CallToolResult> => {
  try {
    if (args.platform === 'browser') {
      if (args.attach) {
        return await attachBrowserSession(args);
      }
      return await startBrowserSession(args);
    }
    return await startMobileSession(args);
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Error starting session: ${e}` }] };
  }
};

export const closeSessionTool: ToolCallback = async (args: { detach?: boolean } = {}): Promise<CallToolResult> => {
  try {
    getBrowser();
    const state = getState();
    const sessionId = state.currentSession;
    const metadata = state.sessionMetadata.get(sessionId);

    const isAttached = !!metadata?.isAttached;
    const detach = args.detach ?? false;

    // Determine if this is a force-close (auto-detached session + explicit close)
    const force = !detach && isAttached;

    const effectiveDetach = detach || isAttached;
    await closeSession(sessionId, detach, isAttached, force);

    const action = effectiveDetach && !force ? 'detached from' : 'closed';
    const note = detach && !isAttached
      ? '\nNote: Session will remain active on Appium server.'
      : '';

    return {
      content: [{ type: 'text', text: `Session ${sessionId} ${action}${note}` }],
    };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Error closing session: ${e}` }] };
  }
};
