import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

export const switchContextToolDefinition: ToolDefinition = {
  name: 'switch_context',
  description: 'Switches between native and webview automation contexts in a hybrid mobile app. In NATIVE_APP context, use accessibility IDs; in WEBVIEW_* context, use CSS/XPath. Changes persist for all subsequent commands. Accepts context name or 1-based index. Use get_contexts to discover available targets. Mobile-only.',
  annotations: { title: 'Switch Context', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    context: z
      .string()
      .describe(
        'Context name to switch to (e.g., "NATIVE_APP", "WEBVIEW_com.example.app", or use index from wdio://session/current/contexts resource)',
      ),
  },
};

export const switchContextTool: ToolCallback = async (args: {
  context: string;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { context } = args;

    if (/^\d+$/.test(context)) {
      const contexts = await browser.getContexts();
      const index = Number.parseInt(context, 10) - 1;
      if (index >= 0 && index < contexts.length) {
        const targetContext = contexts[index] as string;
        await browser.switchContext(targetContext);
        return { content: [{ type: 'text', text: `Switched to context: ${targetContext}` }] };
      }
      throw new Error(`Error: Invalid context index ${context}. Available contexts: ${contexts.length}`);
    }

    await browser.switchContext(context);

    return {
      content: [{ type: 'text', text: `Switched to context: ${context}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error switching context: ${e}` }],
    };
  }
};