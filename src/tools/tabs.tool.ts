import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

export const switchTabToolDefinition: ToolDefinition = {
  name: 'switch_tab',
  description: 'Focuses a browser tab by window handle or 0-based index. All subsequent tool calls operate on the active tab. Provide handle OR index — use get_tabs to find them. Browser-only; use switch_context for mobile webviews.',
  annotations: { title: 'Switch Browser Tab', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    handle: z.string().optional().describe('Window handle to switch to'),
    index: z.number().int().min(0).optional().describe('0-based tab index to switch to'),
  },
};

export const switchTabTool: ToolCallback = async ({ handle, index }: { handle?: string; index?: number }): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    if (handle) {
      await browser.switchToWindow(handle);
      return { content: [{ type: 'text', text: `Switched to tab: ${handle}` }] };
    } else if (index !== undefined) {
      const handles = await browser.getWindowHandles();
      if (index >= handles.length) {
        return { isError: true, content: [{ type: 'text', text: `Error: index ${index} out of range (${handles.length} tabs)` }] };
      }
      await browser.switchToWindow(handles[index]);
      return { content: [{ type: 'text', text: `Switched to tab ${index}: ${handles[index]}` }] };
    }
    return { isError: true, content: [{ type: 'text', text: 'Error: Must provide either handle or index' }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Error switching tab: ${e}` }] };
  }
};