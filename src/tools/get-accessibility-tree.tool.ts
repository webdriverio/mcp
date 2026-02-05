import { getBrowser } from './browser.tool';
import { getBrowserAccessibilityTree } from '../scripts/get-browser-accessibility-tree';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { encode } from '@toon-format/toon';
import { z } from 'zod';

/**
 * Tool definition for get_accessibility
 */
export const getAccessibilityToolDefinition: ToolDefinition = {
  name: 'get_accessibility',
  description: 'gets accessibility tree snapshot with semantic information about page elements (roles, names, states). Browser-only - use when get_visible_elements does not return expected elements.',
  inputSchema: {
    limit: z.number().optional()
      .describe('Maximum number of nodes to return. Default: 100. Use 0 for unlimited.'),
    offset: z.number().optional()
      .describe('Number of nodes to skip (for pagination). Default: 0.'),
    roles: z.array(z.string()).optional()
      .describe('Filter to specific roles (e.g., ["button", "link", "textbox"]). Default: all roles.'),
    namedOnly: z.boolean().optional()
      .describe('Only return nodes with a name/label. Default: true. Filters out anonymous containers.'),
  },
};

export const getAccessibilityTreeTool: ToolCallback = async (args: {
  limit?: number;
  offset?: number;
  roles?: string[];
  namedOnly?: boolean;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    // Check if this is a mobile session - accessibility tree is browser-only
    if (browser.isAndroid || browser.isIOS) {
      return {
        content: [{
          type: 'text',
          text: 'Error: get_accessibility is browser-only. For mobile apps, use get_visible_elements instead.',
        }],
      };
    }

    const { limit = 100, offset = 0, roles, namedOnly = true } = args || {};

    let nodes = await getBrowserAccessibilityTree(browser);

    if (nodes.length === 0) {
      return {
        content: [{ type: 'text', text: 'No accessibility tree available' }],
      };
    }

    // Filter to named nodes only (removes anonymous containers, StaticText duplicates)
    if (namedOnly) {
      nodes = nodes.filter((n) => n.name && n.name.trim() !== '');
    }

    // Filter to specific roles if provided
    if (roles && roles.length > 0) {
      const roleSet = new Set(roles.map((r) => r.toLowerCase()));
      nodes = nodes.filter((n) => n.role && roleSet.has(n.role.toLowerCase()));
    }

    const total = nodes.length;

    // Apply pagination
    if (offset > 0) {
      nodes = nodes.slice(offset);
    }
    if (limit > 0) {
      nodes = nodes.slice(0, limit);
    }

    const result = {
      total,
      showing: nodes.length,
      hasMore: offset + nodes.length < total,
      nodes,
    };

    // Post-process: replace "" with bare commas for efficiency
    const toon = encode(result)
      .replace(/,""/g, ',')
      .replace(/"",/g, ',');

    return {
      content: [{ type: 'text', text: toon }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting accessibility tree: ${e}` }],
    };
  }
};