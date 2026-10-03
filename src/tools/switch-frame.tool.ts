import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';
import { runAction, webAgent } from '../session/agent';

export const switchFrameToolDefinition: ToolDefinition = {
  name: 'switch_frame',
  description: 'Switches into an iframe (ref or selector), or back to the top page when selector is omitted. Later tools act inside the frame until you switch back. Returns the frame\'s elements.',
  annotations: { title: 'Switch Frame', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    selector: z
      .string()
      .optional()
      .describe(
        'Ref or selector of the iframe; omit for the top page',
      ),
  },
};

export const switchFrameTool: ToolCallback = async ({
  selector,
}: {
  selector?: string;
}): Promise<CallToolResult> => {
  const agent = await webAgent();
  if (agent) {
    return runAction(agent, 'frame', { target: selector || 'top' }, selector ? `Switched to iframe: ${selector}` : 'Switched back to top-level frame');
  }
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
