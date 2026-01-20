import { getBrowser } from './browser.tool';
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
    roles: z.array(z.string()).optional()
      .describe('Filter to specific roles (e.g., ["button", "link", "textbox"]). Default: all roles.'),
    namedOnly: z.boolean().optional()
      .describe('Only return nodes with a name/label. Default: true. Filters out anonymous containers.'),
  },
};

/**
 * Flatten a hierarchical accessibility tree into a flat list
 * Only includes properties that have actual values (no null clutter)
 * @param node - The accessibility node
 * @param result - Accumulator array
 */
function flattenAccessibilityTree(node: any, result: any[] = []): any[] {
  if (!node) return result;

  // Add current node (excluding root WebArea unless it has meaningful content)
  if (node.role !== 'WebArea' || node.name) {
    const entry: Record<string, any> = {};

    // Only add properties that have actual values
    if (node.role) entry.role = node.role;
    if (node.name) entry.name = node.name;
    if (node.value !== undefined && node.value !== '') entry.value = node.value;
    if (node.description) entry.description = node.description;
    if (node.keyshortcuts) entry.keyshortcuts = node.keyshortcuts;
    if (node.roledescription) entry.roledescription = node.roledescription;
    if (node.valuetext) entry.valuetext = node.valuetext;
    if (node.disabled) entry.disabled = node.disabled;
    if (node.expanded !== undefined) entry.expanded = node.expanded;
    if (node.focused) entry.focused = node.focused;
    if (node.modal) entry.modal = node.modal;
    if (node.multiline) entry.multiline = node.multiline;
    if (node.multiselectable) entry.multiselectable = node.multiselectable;
    if (node.readonly) entry.readonly = node.readonly;
    if (node.required) entry.required = node.required;
    if (node.selected) entry.selected = node.selected;
    if (node.checked !== undefined) entry.checked = node.checked;
    if (node.pressed !== undefined) entry.pressed = node.pressed;
    if (node.level !== undefined) entry.level = node.level;
    if (node.valuemin !== undefined) entry.valuemin = node.valuemin;
    if (node.valuemax !== undefined) entry.valuemax = node.valuemax;
    if (node.autocomplete) entry.autocomplete = node.autocomplete;
    if (node.haspopup) entry.haspopup = node.haspopup;
    if (node.invalid) entry.invalid = node.invalid;
    if (node.orientation) entry.orientation = node.orientation;

    result.push(entry);
  }

  // Recursively process children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      flattenAccessibilityTree(child, result);
    }
  }

  return result;
}

export const getAccessibilityTreeTool: ToolCallback = async (args: {
  limit?: number;
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

    const { limit = 100, roles, namedOnly = true } = args || {};

    // Get Puppeteer instance for native accessibility API
    const puppeteer = await browser.getPuppeteer();
    const pages = await puppeteer.pages();

    if (pages.length === 0) {
      return {
        content: [{ type: 'text', text: 'No active pages found' }],
      };
    }

    const page = pages[0];

    // Get accessibility snapshot with interestingOnly filter
    const snapshot = await page.accessibility.snapshot({
      interestingOnly: true, // Filter to only interesting/semantic nodes
    });

    if (!snapshot) {
      return {
        content: [{ type: 'text', text: 'No accessibility tree available' }],
      };
    }

    // Flatten the hierarchical tree into a flat list
    let nodes = flattenAccessibilityTree(snapshot);

    // Filter to named nodes only (removes anonymous containers, StaticText duplicates)
    if (namedOnly) {
      nodes = nodes.filter(n => n.name && n.name.trim() !== '');
    }

    // Filter to specific roles if provided
    if (roles && roles.length > 0) {
      const roleSet = new Set(roles.map(r => r.toLowerCase()));
      nodes = nodes.filter(n => n.role && roleSet.has(n.role.toLowerCase()));
    }

    // Apply limit (0 means unlimited)
    if (limit > 0 && nodes.length > limit) {
      nodes = nodes.slice(0, limit);
    }

    return {
      content: [{
        type: 'text',
        text: encode(nodes),
      }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting accessibility tree: ${e}` }],
    };
  }
};