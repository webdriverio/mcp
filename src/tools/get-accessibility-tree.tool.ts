import { getBrowser } from './browser.tool';
import { getBrowserAccessibilityTree } from '../scripts/get-browser-accessibility-tree';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { encode } from '@toon-format/toon';
import { z } from 'zod';

export const getAccessibilityToolDefinition: ToolDefinition = {
  name: 'get_accessibility',
  description: 'Gets the accessibility tree: page structure with headings, landmarks, and semantic roles. Browser-only. Use to understand page layout and context around interactable elements.',
  inputSchema: {
    limit: z.number().optional()
      .describe('Maximum number of nodes to return. Default: 100. Use 0 for unlimited.'),
    offset: z.number().optional()
      .describe('Number of nodes to skip (for pagination). Default: 0.'),
    roles: z.array(z.string()).optional()
      .describe('Filter to specific roles (e.g., ["heading", "navigation", "region"]). Default: all roles.'),
  },
};

export const getAccessibilityTreeTool: ToolCallback = async (args: {
  limit?: number;
  offset?: number;
  roles?: string[];
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    if (browser.isAndroid || browser.isIOS) {
      return {
        content: [{
          type: 'text',
          text: 'Error: get_accessibility is browser-only. For mobile apps, use get_visible_elements instead.',
        }],
      };
    }

    const { limit = 100, offset = 0, roles } = args || {};

    let nodes = await getBrowserAccessibilityTree(browser);

    if (nodes.length === 0) {
      return {
        content: [{ type: 'text', text: 'No accessibility tree available' }],
      };
    }

    // Filter out nodes with no meaningful name
    nodes = nodes.filter((n) => n.name && n.name.trim() !== '');

    if (roles && roles.length > 0) {
      const roleSet = new Set(roles.map((r) => r.toLowerCase()));
      nodes = nodes.filter((n) => n.role && roleSet.has(n.role.toLowerCase()));
    }

    const total = nodes.length;

    if (offset > 0) {
      nodes = nodes.slice(offset);
    }
    if (limit > 0) {
      nodes = nodes.slice(0, limit);
    }

    // Drop state columns that are empty for every node in this result set
    const stateKeys = ['level', 'disabled', 'checked', 'expanded', 'selected', 'pressed', 'required', 'readonly'] as const;
    const usedKeys = stateKeys.filter(k => nodes.some(n => n[k] !== ''));
    const trimmed = nodes.map(({ role, name, selector, ...state }) => {
      const node: Record<string, unknown> = { role, name, selector };
      for (const k of usedKeys) node[k] = state[k];
      return node;
    });

    const result = {
      total,
      showing: trimmed.length,
      hasMore: offset + trimmed.length < total,
      nodes: trimmed,
    };

    const toon = encode(result)
      .replace(/,""/g, ',')
      .replace(/"",/g, ',');

    return {
      content: [{ type: 'text', text: toon }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error getting accessibility tree: ${e}` }],
    };
  }
};
