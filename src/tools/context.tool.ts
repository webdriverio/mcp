import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

// Switch Context Tool Definition
export const switchContextToolDefinition: ToolDefinition = {
  name: 'switch_context',
  description: 'switches between native and webview contexts',
  inputSchema: {
    context: z
      .string()
      .describe(
        'Context name to switch to (e.g., "NATIVE_APP", "WEBVIEW_com.example.app", or use index from get_contexts)',
      ),
  },
};

export async function readContexts(): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
    const contexts = await browser.getContexts();
    return { mimeType: 'application/json', text: JSON.stringify(contexts) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
  }
}

export async function readCurrentContext(): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
    const currentContext = await browser.getContext();
    return { mimeType: 'application/json', text: JSON.stringify(currentContext) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
  }
}

export const switchContextTool: ToolCallback = async (args: {
  context: string;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { context } = args;

    // If context is a number, get the context by index
    let targetContext = context;
    if (/^\d+$/.test(context)) {
      const contexts = await browser.getContexts();
      const index = Number.parseInt(context, 10) - 1; // Convert to 0-based index
      if (index >= 0 && index < contexts.length) {
        targetContext = contexts[index] as string;
      } else {
        throw new Error(`Error: Invalid context index ${context}. Available contexts: ${contexts.length}`);
      }
    }

    await browser.switchContext(targetContext);

    return {
      content: [{ type: 'text', text: `Switched to context: ${targetContext}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error switching context: ${e}` }],
    };
  }
};
