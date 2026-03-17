import { remote } from 'webdriverio';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

export const attachBrowserToolDefinition: ToolDefinition = {
  name: 'attach_browser',
  description: `Attach to a Chrome instance already running with --remote-debugging-port.

Start Chrome first (quit any running Chrome instance before launching):

  macOS — with real profile (preserves extensions, cookies, logins):
    pkill -x "Google Chrome" && sleep 1
    /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/Google/Chrome" --profile-directory=Default &

  macOS — with fresh profile (lightweight, no extensions):
    pkill -x "Google Chrome" && sleep 1
    /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &

  Linux — with real profile:
    google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/google-chrome" --profile-directory=Default &

  Linux — with fresh profile:
    google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &

Verify Chrome is ready: curl http://localhost:9222/json/version

Then call attach_browser() to hand control to the AI. All other tools (navigate, click, get_visible_elements, etc.) will work on the attached session. Use close_session() to detach without closing Chrome.`,
  inputSchema: {
    port: z.number().default(9222).describe('Chrome remote debugging port (default: 9222)'),
    host: z.string().default('localhost').describe('Host where Chrome is running (default: localhost)'),
    userDataDir: z.string().default('/tmp/chrome-debug').describe('Chrome user data directory — must match the --user-data-dir used when launching Chrome. Use your real profile path (e.g. "$HOME/Library/Application Support/Google/Chrome") to preserve extensions and logins, or /tmp/chrome-debug for a fresh profile (default: /tmp/chrome-debug)'),
    navigationUrl: z.string().optional().describe('URL to navigate to immediately after attaching'),
  },
};

async function getActiveTabUrl(host: string, port: number): Promise<string | null> {
  try {
    const res = await fetch(`http://${host}:${port}/json`);
    const tabs = await res.json() as { type: string; url: string }[];
    const page = tabs.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools://'));
    return page?.url ?? null;
  } catch {
    return null;
  }
}

export const attachBrowserTool: ToolCallback = async ({
  port = 9222,
  host = 'localhost',
  userDataDir = '/tmp/chrome-debug',
  navigationUrl,
}: {
  port?: number;
  host?: string;
  userDataDir?: string;
  navigationUrl?: string;
}): Promise<CallToolResult> => {
  try {
    const state = (getBrowser as any).__state;

    // Capture the active tab URL before WebDriver blanks it
    const activeUrl = navigationUrl ?? await getActiveTabUrl(host, port);

    const browser = await remote({
      capabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          debuggerAddress: `${host}:${port}`,
          args: [`--user-data-dir=${userDataDir}`],
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
          args: [`--user-data-dir=${userDataDir}`],
        },
      },
      steps: [],
    });

    if (activeUrl) {
      await browser.url(activeUrl);
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
