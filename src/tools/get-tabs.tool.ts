import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { readTabs } from '../resources';

export const getTabsToolDefinition: ToolDefinition = {
  name: 'get_tabs',
  description: 'Lists all browser tabs with handle, title, URL, and which is active. Use before switch_tab to find the target handle or index. Browser-only.',
  annotations: { title: 'Get Browser Tabs', readOnlyHint: true, idempotentHint: true },
  inputSchema: {},
};

export const getTabsTool: ToolCallback = async (): Promise<CallToolResult> => {
  const result = await readTabs();
  if (result.text.startsWith('Error')) {
    return { isError: true, content: [{ type: 'text', text: result.text }] };
  }
  return { content: [{ type: 'text', text: result.text }] };
};
