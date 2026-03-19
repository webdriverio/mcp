import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser, getState } from '../session/state';
import { registerSession, closeSession } from '../session/lifecycle';
import { localBrowserProvider } from '../providers/local-browser.provider';

const supportedBrowsers = ['chrome', 'firefox', 'edge', 'safari'] as const;
const browserSchema = z.enum(supportedBrowsers).default('chrome');
type SupportedBrowser = z.infer<typeof browserSchema>;

export const startBrowserToolDefinition: ToolDefinition = {
  name: 'start_browser',
  description: 'starts a browser session (Chrome, Firefox, Edge, Safari) and sets it to the current state. Prefer headless: true unless the user explicitly asks to see the browser.',
  inputSchema: {
    browser: browserSchema.describe('Browser to launch: chrome, firefox, edge, safari (default: chrome)'),
    headless: z.boolean().optional().default(true),
    windowWidth: z.number().min(400).max(3840).optional().default(1920),
    windowHeight: z.number().min(400).max(2160).optional().default(1080),
    navigationUrl: z.string().optional().describe('URL to navigate to after starting the browser'),
    capabilities: z.record(z.string(), z.unknown()).optional().describe('Additional W3C capabilities to merge with defaults (e.g. goog:chromeOptions args/extensions/prefs)'),
  },
};

export const closeSessionToolDefinition: ToolDefinition = {
  name: 'close_session',
  description: 'closes or detaches from the current browser or app session',
  inputSchema: {
    detach: z.boolean().optional().describe('If true, disconnect from session without terminating it (preserves app state). Default: false'),
  },
};

export const startBrowserTool: ToolCallback = async ({
  browser = 'chrome',
  headless = true,
  windowWidth = 1920,
  windowHeight = 1080,
  navigationUrl,
  capabilities: userCapabilities = {}
}: {
  browser?: SupportedBrowser;
  headless?: boolean;
  windowWidth?: number;
  windowHeight?: number;
  navigationUrl?: string;
  capabilities?: Record<string, unknown>;
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

  const mergedCapabilities = localBrowserProvider.buildCapabilities({ browser, headless, windowWidth, windowHeight, capabilities: userCapabilities });

  const wdioBrowser = await remote({
    capabilities: mergedCapabilities,
  });

  const { sessionId } = wdioBrowser;

  registerSession(
    sessionId,
    wdioBrowser,
    {
      type: 'browser',
      capabilities: wdioBrowser.capabilities as Record<string, unknown>,
      isAttached: false,
    },
    {
      sessionId,
      type: 'browser',
      startedAt: new Date().toISOString(),
      capabilities: wdioBrowser.capabilities as Record<string, unknown>,
      steps: [],
    },
  );

  let sizeNote = '';
  try {
    await wdioBrowser.setWindowSize(windowWidth, windowHeight);
  } catch (e) {
    sizeNote = `\nNote: Unable to set window size (${windowWidth}x${windowHeight}). ${e}`;
  }

  // Navigate to URL if provided
  if (navigationUrl) {
    await wdioBrowser.url(navigationUrl);
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

export async function readTabs(): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
    const handles = await browser.getWindowHandles();
    const currentHandle = await browser.getWindowHandle();
    const tabs = [];
    for (const handle of handles) {
      await browser.switchToWindow(handle);
      tabs.push({
        handle,
        title: await browser.getTitle(),
        url: await browser.getUrl(),
        isActive: handle === currentHandle,
      });
    }
    // Switch back to the originally active tab
    await browser.switchToWindow(currentHandle);
    return { mimeType: 'application/json', text: JSON.stringify(tabs) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
  }
}

export const switchTabToolDefinition: ToolDefinition = {
  name: 'switch_tab',
  description: 'switches to a browser tab by handle or index',
  inputSchema: {
    handle: z.string().optional().describe('Window handle to switch to'),
    index: z.number().int().min(0).optional().describe('0-based tab index to switch to'),
  },
};

export const switchTabTool: ToolCallback = async ({ handle, index }: { handle?: string; index?: number }) => {
  try {
    const browser = getBrowser();
    if (handle) {
      await browser.switchToWindow(handle);
      return { content: [{ type: 'text', text: `Switched to tab: ${handle}` }] };
    } else if (index !== undefined) {
      const handles = await browser.getWindowHandles();
      if (index >= handles.length) {
        return { isError: true, content: [{ type: 'text', text: `Error: index ${index} out of range (${handles.length} tabs)` }] };
      }
      await browser.switchToWindow(handles[index]);
      return { content: [{ type: 'text', text: `Switched to tab ${index}: ${handles[index]}` }] };
    }
    return { isError: true, content: [{ type: 'text', text: 'Error: Must provide either handle or index' }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Error switching tab: ${e}` }] };
  }
};

export const closeSessionTool: ToolCallback = async (args: { detach?: boolean } = {}): Promise<CallToolResult> => {
  try {
    getBrowser(); // throws if no active session
    const state = getState();
    const sessionId = state.currentSession;
    const metadata = state.sessionMetadata.get(sessionId);

    // Skip deleteSession for attached sessions (not created by us) or when user explicitly detaches
    const effectiveDetach = args.detach || !!metadata?.isAttached;

    await closeSession(sessionId, args.detach ?? false, !!metadata?.isAttached);

    const action = effectiveDetach ? 'detached from' : 'closed';
    const note = args.detach && !metadata?.isAttached
      ? '\nNote: Session will remain active on Appium server.'
      : '';

    return {
      content: [{ type: 'text', text: `Session ${sessionId} ${action}${note}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error closing session: ${e}` }],
    };
  }
};
