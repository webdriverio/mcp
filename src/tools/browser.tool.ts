import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';

const supportedBrowsers = ['chrome', 'firefox', 'edge', 'safari'] as const;
const browserSchema = z.enum(supportedBrowsers).default('chrome');
type SupportedBrowser = z.infer<typeof browserSchema>;

export const startBrowserToolDefinition: ToolDefinition = {
  name: 'start_browser',
  description: 'starts a browser session (Chrome, Firefox, Edge, Safari) and sets it to the current state',
  inputSchema: {
    browser: browserSchema.describe('Browser to launch: chrome, firefox, edge, safari (default: chrome)'),
    headless: z.boolean().optional(),
    windowWidth: z.number().min(400).max(3840).optional().default(1920),
    windowHeight: z.number().min(400).max(2160).optional().default(1080),
    navigationUrl: z.string().optional().describe('URL to navigate to after starting the browser'),
  },
};

export const closeSessionToolDefinition: ToolDefinition = {
  name: 'close_session',
  description: 'closes or detaches from the current browser or app session',
  inputSchema: {
    detach: z.boolean().optional().describe('If true, disconnect from session without terminating it (preserves app state). Default: false'),
  },
};

const state: {
  browsers: Map<string, WebdriverIO.Browser>;
  currentSession: string | null;
  sessionMetadata: Map<string, { type: 'browser' | 'ios' | 'android'; capabilities: any; isAttached: boolean }>;
} = {
  browsers: new Map<string, WebdriverIO.Browser>(),
  currentSession: null,
  sessionMetadata: new Map(),
};

export const getBrowser = () => {
  const browser = state.browsers.get(state.currentSession);
  if (!browser) {
    throw new Error('No active browser session');
  }
  return browser;
};
// Export state for app-session.tool.ts to access
(getBrowser as any).__state = state;

export const startBrowserTool: ToolCallback = async ({
  browser = 'chrome',
  headless = false,
  windowWidth = 1920,
  windowHeight = 1080,
  navigationUrl
}: {
  browser?: SupportedBrowser;
  headless?: boolean;
  windowWidth?: number;
  windowHeight?: number;
  navigationUrl?: string;
}): Promise<CallToolResult> => {
  const browserDisplayNames: Record<SupportedBrowser, string> = {
    chrome: 'Chrome',
    firefox: 'Firefox',
    edge: 'Edge',
    safari: 'Safari',
  };
  const selectedBrowser = browser;
  const headlessSupported = selectedBrowser !== 'safari';
  const effectiveHeadless = headless && headlessSupported;
  const chromiumArgs = [
    `--window-size=${windowWidth},${windowHeight}`,
    '--no-sandbox',
    '--disable-search-engine-choice-screen',
    '--disable-infobars',
    '--log-level=3',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--disable-web-security',
    '--allow-running-insecure-content',
  ];

  // Add headless argument if enabled
  if (effectiveHeadless) {
    chromiumArgs.push('--headless=new');
    chromiumArgs.push('--disable-gpu');
    chromiumArgs.push('--disable-dev-shm-usage');
  }

  const firefoxArgs: string[] = [];
  if (effectiveHeadless && selectedBrowser === 'firefox') {
    firefoxArgs.push('-headless');
  }

  const capabilities: Record<string, any> = {
    acceptInsecureCerts: true,
  };

  switch (selectedBrowser) {
    case 'chrome':
      capabilities.browserName = 'chrome';
      capabilities['goog:chromeOptions'] = { args: chromiumArgs };
      break;
    case 'edge':
      capabilities.browserName = 'msedge';
      capabilities['ms:edgeOptions'] = { args: chromiumArgs };
      break;
    case 'firefox':
      capabilities.browserName = 'firefox';
      if (firefoxArgs.length > 0) {
        capabilities['moz:firefoxOptions'] = { args: firefoxArgs };
      }
      break;
    case 'safari':
      capabilities.browserName = 'safari';
      break;
  }

  const browser = await remote({
    capabilities,
  });

  const { sessionId } = browser;
  state.browsers.set(sessionId, browser);
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, {
    type: 'browser',
    capabilities: browser.capabilities,
    isAttached: false,
  });

  let sizeNote = '';
  try {
    await browser.setWindowSize(windowWidth, windowHeight);
  } catch (e) {
    sizeNote = `\nNote: Unable to set window size (${windowWidth}x${windowHeight}). ${e}`;
  }

  // Navigate to URL if provided
  if (navigationUrl) {
    await browser.url(navigationUrl);
  }

  const modeText = effectiveHeadless ? 'headless' : 'headed';
  const browserText = browserDisplayNames[selectedBrowser];
  const urlText = navigationUrl ? ` and navigated to ${navigationUrl}` : '';
  const headlessNote = headless && !headlessSupported
    ? '\nNote: Safari does not support headless mode. Started in headed mode.'
    : '';
  return {
    content: [{
      type: 'text',
      text: `${browserText} browser started in ${modeText} mode with sessionId: ${sessionId} (${windowWidth}x${windowHeight})${urlText}${headlessNote}${sizeNote}`,
    }],
  };
};

export const closeSessionTool: ToolCallback = async (args: { detach?: boolean } = {}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const sessionId = state.currentSession;
    const metadata = state.sessionMetadata.get(sessionId);

    // Only delete session if not detaching
    if (!args.detach) {
      await browser.deleteSession();
    }

    // Always clean up local state
    state.browsers.delete(sessionId);
    state.sessionMetadata.delete(sessionId);
    state.currentSession = null;

    const action = args.detach ? 'detached from' : 'closed';
    const note = args.detach && !metadata?.isAttached
      ? '\nNote: Session will remain active on Appium server.'
      : '';

    return {
      content: [{ type: 'text', text: `Session ${sessionId} ${action}${note}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error closing session: ${e}` }],
    };
  }
};
