import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

export const switchFrameToolDefinition: ToolDefinition = {
    name: 'switch_frame',
    description:
        'Switches into an iframe by CSS or XPath selector, or back to the top-level frame if no selector is given. Required before interacting with elements inside iframes — click, set_value, and get_elements only see the current frame context. Browser-only.',
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
