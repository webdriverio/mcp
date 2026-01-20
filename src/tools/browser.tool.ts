import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';

export const startBrowserToolDefinition: ToolDefinition = {
  name: 'start_browser',
  description: 'starts a browser session and sets it to the current state',
  inputSchema: {
    headless: z.boolean().optional(),
    windowWidth: z.number().min(400).max(3840).optional(),
    windowHeight: z.number().min(400).max(2160).optional(),
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

export const startBrowserTool: ToolCallback = async ({ headless = false, windowWidth = 1280, windowHeight = 1080}: {
  headless?: boolean;
  windowWidth?: number;
  windowHeight?: number;
}): Promise<CallToolResult> => {
  const chromeArgs = [
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
  if (headless) {
    chromeArgs.push('--headless=new');
    chromeArgs.push('--disable-gpu');
    chromeArgs.push('--disable-dev-shm-usage');
  }

  const browser = await remote({
    capabilities: {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: chromeArgs,
      },
      acceptInsecureCerts: true,
    },
  });

  const { sessionId } = browser;
  state.browsers.set(sessionId, browser);
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, {
    type: 'browser',
    capabilities: browser.capabilities,
    isAttached: false,
  });

  const modeText = headless ? 'headless' : 'headed';
  return {
    content: [{
      type: 'text',
      text: `Browser started in ${modeText} mode with sessionId: ${sessionId} (${windowWidth}x${windowHeight})`,
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