import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

// Get Contexts Tool Definition
export const getContextsToolDefinition: ToolDefinition = {
  name: 'get_contexts',
  description: 'lists available contexts (NATIVE_APP, WEBVIEW)',
  inputSchema: {},
};

// Get Current Context Tool Definition
export const getCurrentContextToolDefinition: ToolDefinition = {
  name: 'get_current_context',
  description: 'shows the currently active context',
  inputSchema: {},
};

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

// Get Contexts Tool
export const getContextsTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    const contexts = await browser.getContexts();

    return {
      content: [
        {
          type: 'text',
          text: `Available contexts:\n${contexts.map((ctx, idx) => `${idx + 1}. ${ctx}`).join('\n')}`,
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting contexts: ${e}` }],
    };
  }
};

// Get Current Context Tool
export const getCurrentContextTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    const currentContext = await browser.getContext();

    return {
      content: [{ type: 'text', text: `Current context: ${JSON.stringify(currentContext)}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting current context: ${e}` }],
    };
  }
};

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
      const index = parseInt(context, 10) - 1; // Convert to 0-based index
      if (index >= 0 && index < contexts.length) {
        targetContext = contexts[index] as string;
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid context index ${context}. Available contexts: ${contexts.length}`,
            },
          ],
        };
      }
    }

    await browser.switchContext(targetContext);

    return {
      content: [{ type: 'text', text: `Switched to context: ${targetContext}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error switching context: ${e}` }],
    };
  }
};
