import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { readAccessibilityTree } from '../resources';
import { coerceBoolean } from '../utils/zod-helpers';

export const accessibilityToolDefinition: ToolDefinition = {
  name: 'get_accessibility_tree',
  description: 'Returns the page accessibility tree with roles, names, and selectors. Browser-only. Supports filtering by ARIA roles and pagination via limit/offset.',
  annotations: { title: 'Get Accessibility Tree', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    limit: z.number().optional().default(0).describe('Maximum number of nodes to return (0 = no limit)'),
    offset: z.number().optional().default(0).describe('Number of nodes to skip for pagination'),
    roles: z.array(z.string()).optional().describe('Filter by ARIA roles, e.g. ["button", "link", "heading"]'),
    inViewportOnly: coerceBoolean.optional().default(true).describe('Limit to elements in the current viewport (default: true). Set false for the full tree — much larger.'),
  },
};

export const accessibilityTool: ToolCallback = async ({ limit = 0, offset = 0, roles, inViewportOnly = true }: {
  limit?: number;
  offset?: number;
  roles?: string[];
  inViewportOnly?: boolean;
}): Promise<CallToolResult> => {
  const result = await readAccessibilityTree({ limit, offset, roles, inViewportOnly });
  if (result.text.startsWith('Error')) {
    return { isError: true, content: [{ type: 'text', text: result.text }] };
  }
  return { content: [{ type: 'text', text: result.text }] };
};
