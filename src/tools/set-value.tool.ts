import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';

const defaultTimeout: number = 3000;

export const setValueToolDefinition: ToolDefinition = {
  name: 'set_value',
  description: 'set value to an element, aka typing',
  inputSchema: {
    selector: z.string().describe('Value for the selector, in the form of css selector or xpath ("button.my-class" or "//button[@class=\'my-class\']")'),
    value: z.string().describe('Text to enter into the element'),
    scrollToView: z.boolean().optional().describe('Whether to scroll the element into view before typing').default(true),
    timeout: z.number().optional().describe('Maximum time to wait for element in milliseconds'),
  },
};

export const setValueTool: ToolCallback = async ({ selector, value, scrollToView = true, timeout = defaultTimeout}: {
  selector: string;
  value: string;
  scrollToView?: boolean;
  timeout?: number
}) => {
  try {
    const browser = getBrowser();
    await browser.waitUntil(browser.$(selector).isExisting, { timeout });
    if (scrollToView) {
      await browser.$(selector).scrollIntoView({ block: 'center', inline: 'center' });
    }
    await browser.$(selector).clearValue();
    await browser.$(selector).setValue(value);
    return {
      content: [{ type: 'text', text: `Text "${value}" entered into element` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error entering text: ${e}` }],
    };
  }
};