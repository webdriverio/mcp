import { getBrowser } from '../session/state';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';

export const navigateToolDefinition: ToolDefinition = {
  name: 'navigate',
  description: 'Loads a URL in the current tab and waits for the page load event. Resets page state — DOM, JS runtime, timers, and frame context are destroyed. Use instead of clicking links when the target URL is known.',
  annotations: { title: 'Navigate to URL', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    url: z.string().min(1).describe('The URL to navigate to'),
  },
};

export const navigateAction = async (url: string): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    await browser.url(url);
    return {
      content: [{ type: 'text', text: `Navigated to ${url}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error navigating: ${e}` }],
    };
  }
};

export const navigateTool: ToolCallback = async ({ url }: { url: string }) => navigateAction(url);
