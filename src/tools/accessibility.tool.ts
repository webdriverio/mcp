import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { readAccessibilityTree } from '../resources';

export const accessibilityToolDefinition: ToolDefinition = {
  name: 'get_accessibility_tree',
  description: 'Returns the page accessibility tree with roles, names, and selectors. Browser-only. Supports filtering by ARIA roles and pagination via limit/offset.',
  annotations: { title: 'Get Accessibility Tree', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    limit: z.number().optional().default(0).describe('Maximum number of nodes to return (0 = no limit)'),
    offset: z.number().optional().default(0).describe('Number of nodes to skip for pagination'),
    roles: z.array(z.string()).optional().describe('Filter by ARIA roles, e.g. ["button", "link", "heading"]'),
  },
};

export const accessibilityTool: ToolCallback = async ({ limit = 0, offset = 0, roles }: {
  limit?: number;
  offset?: number;
  roles?: string[];
}): Promise<CallToolResult> => {
  const result = await readAccessibilityTree({ limit, offset, roles });
  if (result.text.startsWith('Error')) {
    return { isError: true, content: [{ type: 'text', text: result.text }] };
  }
  return { content: [{ type: 'text', text: result.text }] };
};
