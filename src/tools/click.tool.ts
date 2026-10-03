import { getBrowser } from '../session/state';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';
import { pageChange, pageInfo } from '../utils/page-info';
import { runAction, webAgent } from '../session/agent';

const defaultTimeout: number = 3000;

export const clickToolDefinition: ToolDefinition = {
  name: 'click_element',
  description: 'Clicks an element. In browsers the result lists what changed on the page (new elements with refs, or the new page). On iOS use tap_element. Several steps in a row: perform_actions.',
  annotations: { title: 'Click Element', destructiveHint: false },
  inputSchema: {
    selector: z.string().describe('Ref from snapshot (e12) or selector: CSS, XPath, "button=Exact text", "a*=Partial text"'),
    scrollToView: coerceBoolean.optional().describe('Whether to scroll the element into view before clicking').default(true),
    timeout: z.number().optional().describe('Maximum time to wait for element in milliseconds'),
  },
};

export const clickAction = async (selector: string, timeout: number, scrollToView = true): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const before = await pageInfo(browser);
    await browser.waitUntil(browser.$(selector).isExisting, { timeout });
    if (scrollToView) {
      await browser.$(selector).scrollIntoView({ block: 'center', inline: 'center' });
    }
    await browser.$(selector).click();
    return {
      content: [{ type: 'text', text: `Element clicked (selector: ${selector})${await pageChange(browser, before)}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error clicking element: ${e}` }],
    };
  }
};

export const clickTool: ToolCallback = async ({ selector, scrollToView, timeout = defaultTimeout }: {
  selector: string;
  scrollToView?: boolean;
  timeout?: number
}): Promise<CallToolResult> => {
  const agent = await webAgent();
  return agent ? runAction(agent, 'click', { target: selector }, 'Clicked.') : clickAction(selector, timeout, scrollToView);
};
