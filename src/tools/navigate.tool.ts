import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';

export const navigateToolDefinition: ToolDefinition = {
  name: 'navigate',
  description: 'navigates to a URL',
  inputSchema: {
    url: z.string().min(1).describe('The URL to navigate to'),
  },
};

export const navigateTool: ToolCallback = async ({ url}: { url: string }) => {
  try {
    const browser = getBrowser();
    await browser.url(url);
    return {
      content: [{ type: 'text', text: `Navigated to ${url}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error navigating: ${e}` }],
    };
  }
};
