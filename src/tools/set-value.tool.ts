import { getBrowser } from '../session/state';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';

const defaultTimeout: number = 3000;

export const setValueToolDefinition: ToolDefinition = {
  name: 'set_value',
  description: 'set value to an element, aka typing',
  inputSchema: {
    selector: z.string().describe('Value for the selector, in the form of css selector or xpath ("button.my-class" or "//button[@class=\'my-class\']")'),
    value: z.string().describe('Text to enter into the element'),
    scrollToView: coerceBoolean.optional().describe('Whether to scroll the element into view before typing').default(true),
    timeout: z.number().optional().describe('Maximum time to wait for element in milliseconds'),
  },
};

export const setValueAction = async (
  selector: string,
  value: string,
  scrollToView = true,
  timeout = defaultTimeout,
): Promise<CallToolResult> => {
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
      isError: true,
      content: [{ type: 'text', text: `Error entering text: ${e}` }],
    };
  }
};

export const setValueTool: ToolCallback = async ({ selector, value, scrollToView = true, timeout = defaultTimeout}: {
  selector: string;
  value: string;
  scrollToView?: boolean;
  timeout?: number
}) => setValueAction(selector, value, scrollToView, timeout);