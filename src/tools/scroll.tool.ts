import { getBrowser } from './browser.tool';
import { getState } from './app-session.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';

export const scrollToolDefinition: ToolDefinition = {
  name: 'scroll',
  description: 'scrolls the page by specified pixels (browser only). For mobile, use the swipe tool.',
  inputSchema: {
    direction: z.enum(['up', 'down']).describe('Scroll direction'),
    pixels: z.number().optional().default(500).describe('Number of pixels to scroll'),
  },
};

export const scrollTool: ToolCallback = async ({ direction, pixels = 500 }: { direction: 'up' | 'down'; pixels?: number }) => {
  try {
    const browser = getBrowser();
    const state = getState();
    const metadata = state.sessionMetadata.get(state.currentSession);
    const sessionType = metadata?.type;

    if (sessionType !== 'browser') {
      throw new Error('scroll only works in browser sessions. For mobile, use the swipe tool.');
    }

    const scrollAmount = direction === 'down' ? pixels : -pixels;
    await browser.execute((amount) => {
      window.scrollBy(0, amount);
    }, scrollAmount);

    return {
      content: [{ type: 'text', text: `Scrolled ${direction} ${pixels} pixels` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error scrolling: ${e}` }],
    };
  }
};