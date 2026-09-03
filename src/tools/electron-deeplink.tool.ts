import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser, getState } from '../session/state';

export const triggerElectronDeeplinkToolDefinition: ToolDefinition = {
  name: 'trigger_electron_deeplink',
  description: 'Triggers a deeplink through the active Electron application. The Electron session must be started with electronDeeplinkScheme matching the URL scheme. Packaged binaries are required for deeplinks on Windows and Linux.',
  annotations: { title: 'Trigger Electron Deeplink', destructiveHint: true },
  inputSchema: { url: z.string().refine(value => {
    try { new URL(value); return true; } catch { return false; }
  }, 'Must be a valid URI.').describe('Deeplink URI to trigger through the Electron service.') },
};

export const triggerElectronDeeplinkTool: ToolCallback = async (args: { url: string }): Promise<CallToolResult> => {
  try {
    const state = getState();
    const metadata = state.currentSession ? state.sessionMetadata.get(state.currentSession) : undefined;
    if (metadata?.runtime !== 'electron') {
      return { isError: true, content: [{ type: 'text', text: 'Error triggering Electron deeplink: no active Electron session.' }] };
    }
    if (!metadata.electronDeeplinkScheme) {
      return { isError: true, content: [{ type: 'text', text: 'Error triggering Electron deeplink: start the Electron session with electronDeeplinkScheme before triggering deeplinks.' }] };
    }
    const url = new URL(args.url);
    if (url.protocol !== `${metadata.electronDeeplinkScheme}:`) {
      return { isError: true, content: [{ type: 'text', text: `Error triggering Electron deeplink: URL scheme must be "${metadata.electronDeeplinkScheme}:".` }] };
    }
    const browser = getBrowser() as WebdriverIO.Browser & { electron?: { triggerDeeplink: (url: string) => Promise<void> } };
    if (!browser.electron?.triggerDeeplink) {
      return { isError: true, content: [{ type: 'text', text: 'Error triggering Electron deeplink: Electron deeplink support is unavailable for this session.' }] };
    }
    await browser.electron.triggerDeeplink(args.url);
    return { content: [{ type: 'text', text: `Electron deeplink triggered: ${args.url}` }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: `Error triggering Electron deeplink: ${error instanceof Error ? error.message : String(error)}` }] };
  }
};
