import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';

const defaultTimeout: number = 3000;

export const clickToolDefinition: ToolDefinition = {
  name: 'click_element',
  description: 'clicks an element',
  inputSchema: {
    selector: z.string().describe('Value for the selector, in the form of css selector or xpath ("button.my-class" or "//button[@class=\'my-class\']" or "button=Exact text with spaces" or "a*=Link containing text")'),
    scrollToView: z.boolean().optional().describe('Whether to scroll the element into view before clicking').default(true),
    timeout: z.number().optional().describe('Maximum time to wait for element in milliseconds'),
  },
};

export const clickViaTextToolDefinition: ToolDefinition = {
  name: 'click_via_text',
  description: 'clicks an element',
  inputSchema: {
    selector: z.string().describe('Value for the selector, in the form of css selector or xpath ("button.my-class" or "//button[@class=\'my-class\']" or "button=Exact text with spaces" or "a*=Link containing text")'),
    scrollToView: z.boolean().optional().describe('Whether to scroll the element into view before clicking').default(true),
    timeout: z.number().optional().describe('Maximum time to wait for element in milliseconds'),
  },
};

const clickAction = async (selector: string, timeout: number, scrollToView = true): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    await browser.waitUntil(browser.$(selector).isExisting, { timeout });
    if (scrollToView) {
      await browser.$(selector).scrollIntoView({ block: 'center', inline: 'center' });
    }
    await browser.$(selector).click();
    return {
      content: [{ type: 'text', text: `Element clicked (selector: ${selector})` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error clicking element: ${e}` }],
    };
  }
};

export const clickTool: ToolCallback = async ({ selector, scrollToView, timeout = defaultTimeout}: {
  selector: string;
  scrollToView?: boolean;
  timeout?: number
}): Promise<CallToolResult> => clickAction(selector, timeout, scrollToView);

export const clickToolViaText: ToolCallback = async ({ text, scrollToView, timeout = defaultTimeout}: {
  text: string;
  scrollToView?: boolean;
  timeout?: number
}): Promise<CallToolResult> => clickAction(`//a[contains(text(), '${text}')]`, timeout, scrollToView);
