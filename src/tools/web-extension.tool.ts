import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getBrowser, getState } from '../session/state';
import { activeSessionId } from '../session/context';
import type { ToolDefinition } from '../types/tool';
import { errorResult } from '../session/agent';

type WebExtensionData =
  | { type: 'path'; path: string }
  | { type: 'archivePath'; path: string }
  | { type: 'base64'; value: string };

type WebExtensionInstallResult = { extension: string };

type WebExtensionBrowser = WebdriverIO.Browser & {
  webExtensionInstall?: (params: { extensionData: WebExtensionData }) => Promise<WebExtensionInstallResult>;
};

type BrowserSession = {
  browser: WebExtensionBrowser;
};

type OpenWebExtensionArgs = {
  extensionData: WebExtensionData;
  path: string;
  scheme?: 'chrome-extension' | 'moz-extension';
};

const extensionDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('path'),
    path: z.string().min(1).describe('Path to an unpacked extension directory on the remote end.'),
  }),
  z.object({
    type: z.literal('archivePath'),
    path: z.string().min(1).describe('Path to a packaged extension archive on the remote end.'),
  }),
  z.object({
    type: z.literal('base64'),
    value: z.string().min(1).describe('Base64-encoded packaged extension archive.'),
  }),
]);

function getBrowserSession(): BrowserSession | CallToolResult {
  const state = getState();
  const sessionId = activeSessionId();
  if (!sessionId) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Error: No active browser session' }],
    };
  }

  const browser = getBrowser() as WebExtensionBrowser;
  const metadata = state.sessionMetadata.get(sessionId);

  if (metadata?.type === 'ios' || metadata?.type === 'android') {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Error: web extension tools are only supported for browser sessions.' }],
    };
  }

  if (!browser.isBidi) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: 'Error: web extension tools require a BiDi-enabled browser session. Start a browser session with capabilities: { webSocketUrl: true }.',
      }],
    };
  }

  return { browser };
}

function isToolResult(value: BrowserSession | CallToolResult): value is CallToolResult {
  return 'content' in value;
}

function inferExtensionScheme(browser: WebExtensionBrowser): 'chrome-extension' | 'moz-extension' {
  const browserName = String(browser.capabilities?.browserName ?? '').toLowerCase();
  return browser.isFirefox || browserName.includes('firefox') ? 'moz-extension' : 'chrome-extension';
}

function normalizeExtensionPath(path: string): string {
  return path.replace(/^\/+/, '');
}

export const openWebExtensionToolDefinition: ToolDefinition = {
  name: 'open_web_extension',
  description: 'Installs a web extension through WebDriver BiDi and opens one of its extension pages so existing MCP tools can inspect and drive its UI. Requires a BiDi-enabled browser session. Use base64 for cloud/remote sessions where the browser driver cannot read the MCP server filesystem.',
  annotations: { title: 'Open Web Extension', destructiveHint: false },
  inputSchema: {
    extensionData: extensionDataSchema.describe('W3C BiDi webExtension.ExtensionData: unpacked directory path, archive path, or base64 archive.'),
    path: z.string().min(1).describe('Path inside the extension package, such as options.html or popup.html. Leading slashes are ignored.'),
  },
};

export const openWebExtensionTool: ToolCallback = async (args: OpenWebExtensionArgs): Promise<CallToolResult> => {
  try {
    const session = getBrowserSession();
    if (isToolResult(session)) return session;

    if (typeof session.browser.webExtensionInstall !== 'function') {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Error: the active WebdriverIO browser does not expose webExtensionInstall. Upgrade WebdriverIO or use a browser driver with WebDriver BiDi webExtension support.',
        }],
      };
    }

    const result = await session.browser.webExtensionInstall({ extensionData: args.extensionData });
    if (!result?.extension || typeof result.extension !== 'string') {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: webExtension.install returned an unexpected result: ${JSON.stringify(result)}` }],
      };
    }

    const scheme = args.scheme ?? inferExtensionScheme(session.browser);
    args.scheme = scheme;

    const targetUrl = `${scheme}://${result.extension}/${normalizeExtensionPath(args.path)}`;
    await session.browser.url(targetUrl);

    return {
      content: [{ type: 'text', text: `Opened web extension page: ${targetUrl}` }],
    };
  } catch (e) {
    return errorResult(e, 'Error opening web extension');
  }
};
