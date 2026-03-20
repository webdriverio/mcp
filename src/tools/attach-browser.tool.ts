import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

export const attachBrowserToolDefinition: ToolDefinition = {
  name: 'attach_browser',
  description: `Attach to a Chrome instance already running with --remote-debugging-port.

Use launch_chrome() first to prepare and launch Chrome with remote debugging enabled.`,
  inputSchema: {
    port: z.number().default(9222).describe('Chrome remote debugging port (default: 9222)'),
    host: z.string().default('localhost').describe('Host where Chrome is running (default: localhost)'),
    navigationUrl: z.string().optional().describe('URL to navigate to immediately after attaching'),
  },
};

type TabSnapshot = { activeTabUrl: string | undefined; allTabUrls: string[] };

// ChromeDriver injects a BiDi-CDP Mapper page when creating a session. If the previous session
// was detached without proper cleanup, this target remains and causes "unexpected alert open" on
// the next attach attempt. Close any stale mappers before creating a new session.
// Returns the active tab URL (first real page tab) and all page tab URLs — Chrome lists the
// active/focused tab first in /json.
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

// After CDP session init, Chrome blanks the first tab it takes over. This restores any tabs
// that became about:blank and then switches focus to the originally active tab.
async function restoreAndSwitchToActiveTab(
  browser: WebdriverIO.Browser,
  activeTabUrl: string,
  allTabUrls: string[],
): Promise<void> {
  const handles = await browser.getWindowHandles();
  const currentUrls: string[] = [];
  for (const handle of handles) {
    await browser.switchToWindow(handle);
    currentUrls.push(await browser.getUrl());
  }

  // Restore blank tabs that had a known URL before attaching.
  const missingUrls = allTabUrls.filter((u) => !currentUrls.includes(u));
  let missingIdx = 0;
  for (let i = 0; i < handles.length; i++) {
    if (currentUrls[i] === 'about:blank' && missingIdx < missingUrls.length) {
      await browser.switchToWindow(handles[i]);
      await browser.url(missingUrls[missingIdx]);
      currentUrls[i] = missingUrls[missingIdx++];
    }
  }

  // Switch to the originally active tab.
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

export const attachBrowserTool: ToolCallback = async ({
  port = 9222,
  host = 'localhost',
  navigationUrl,
}: {
  port?: number;
  host?: string;
  navigationUrl?: string;
}): Promise<CallToolResult> => {
  try {
    const state = (getBrowser as any).__state;

    await waitForCDP(host, port);
    const { activeTabUrl, allTabUrls } = await closeStaleMappers(host, port);

    const browser = await remote({
      connectionRetryTimeout: 30000,
      connectionRetryCount: 3,
      capabilities: {
        browserName: 'chrome',
        unhandledPromptBehavior: 'dismiss',
        webSocketUrl: false,
        'goog:chromeOptions': {
          debuggerAddress: `${host}:${port}`,
        },
      },
    });

    const { sessionId } = browser;
    state.browsers.set(sessionId, browser);
    state.currentSession = sessionId;
    state.sessionMetadata.set(sessionId, {
      type: 'browser',
      capabilities: browser.capabilities,
      isAttached: true,
    });
    state.sessionHistory.set(sessionId, {
      sessionId,
      type: 'browser',
      startedAt: new Date().toISOString(),
      capabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          debuggerAddress: `${host}:${port}`,
        },
      },
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
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error attaching to browser: ${e}` }],
    };
  }
};
