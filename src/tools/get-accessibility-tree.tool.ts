import { getBrowser } from './browser.tool';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { encode } from '@toon-format/toon';

/**
 * Flatten a hierarchical accessibility tree into a flat list
 * @param node - The accessibility node
 * @param result - Accumulator array
 */
function flattenAccessibilityTree(node: any, result: any[] = []): any[] {
  if (!node) return result;

  // Add current node (excluding root WebArea unless it has meaningful content)
  if (node.role !== 'WebArea' || node.name) {
    result.push({
      role: node.role,
      name: node.name,
      value: node.value,
      description: node.description,
      keyshortcuts: node.keyshortcuts,
      roledescription: node.roledescription,
      valuetext: node.valuetext,
      disabled: node.disabled,
      expanded: node.expanded,
      focused: node.focused,
      modal: node.modal,
      multiline: node.multiline,
      multiselectable: node.multiselectable,
      readonly: node.readonly,
      required: node.required,
      selected: node.selected,
      checked: node.checked,
      pressed: node.pressed,
      level: node.level,
      valuemin: node.valuemin,
      valuemax: node.valuemax,
      autocomplete: node.autocomplete,
      haspopup: node.haspopup,
      invalid: node.invalid,
      orientation: node.orientation,
    });
  }

  // Recursively process children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      flattenAccessibilityTree(child, result);
    }
  }

  return result;
}

export const getAccessibilityTreeTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

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
    const flattenedNodes = flattenAccessibilityTree(snapshot);

    return {
      content: [{
        type: 'text',
        text: encode(flattenedNodes),
      }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting accessibility tree: ${e}` }],
    };
  }
};
