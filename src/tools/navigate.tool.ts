import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';

export const navigateToolArguments: { url: z.ZodString } = {
  url: z.string().nonempty('URL must be provided'),
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
