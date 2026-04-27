import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

export const switchFrameToolDefinition: ToolDefinition = {
  name: 'switch_frame',
  description: 'Switches WebDriver frame context into an iframe by CSS/XPath selector, or back to top-level if selector is omitted. Changes persist — all subsequent click_element, set_value, get_elements calls operate within the switched frame until you switch back. Waits up to 5s for the iframe. Browser-only.',
  annotations: { title: 'Switch Frame', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    selector: z
      .string()
      .optional()
      .describe(
        'CSS/XPath selector for the iframe element. Omit to switch back to the top-level frame.',
      ),
  },
};

export const switchFrameTool: ToolCallback = async ({
  selector,
}: {
  selector?: string;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    if (!selector) {
      await browser.switchFrame(null);
      return { content: [{ type: 'text', text: 'Switched back to top-level frame' }] };
    }
    const iframe = await browser.$(selector);
    await iframe.waitForExist({ timeout: 5000 });
    await browser.switchFrame(iframe);
    return { content: [{ type: 'text', text: `Switched to iframe: ${selector}` }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Error switching frame: ${e}` }] };
  }
};
