import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';

export const scrollDownToolDefinition: ToolDefinition = {
  name: 'scroll_down',
  description: 'scrolls the page down by specified pixels',
  inputSchema: {
    pixels: z.number().optional().default(500),
  },
};

export const scrollDownTool: ToolCallback = async ({ pixels = 500}: { pixels?: number }) => {
  try {
    const browser = getBrowser();
    await browser.execute((scrollPixels) => {
      window.scrollBy(0, scrollPixels);
    }, pixels);
    return {
      content: [{ type: 'text', text: `Scrolled down ${pixels} pixels` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error scrolling down: ${e}` }],
    };
  }
};