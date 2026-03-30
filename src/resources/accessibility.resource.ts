import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';
import { getBrowserAccessibilityTree } from '../scripts/get-browser-accessibility-tree';
import { encode } from '@toon-format/toon';

export async function readAccessibilityTree(params: {
  limit?: number;
  offset?: number;
  roles?: string[];
}): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();

    if (browser.isAndroid || browser.isIOS) {
      return {
        mimeType: 'text/plain',
        text: 'Error: accessibility is browser-only. For mobile apps, use elements resource instead.',
      };
    }

    const { limit = 0, offset = 0, roles } = params;

    let nodes = await getBrowserAccessibilityTree(browser);

    if (nodes.length === 0) {
      return { mimeType: 'text/plain', text: 'No accessibility tree available' };
    }

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

    const stateKeys = ['level', 'disabled', 'checked', 'expanded', 'selected', 'pressed', 'required', 'readonly'] as const;
    const usedKeys = stateKeys.filter((k) => nodes.some((n) => n[k] !== ''));
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

    const toon = encode(result).replace(/,""/g, ',').replace(/"",/g, ',');

    return { mimeType: 'text/plain', text: toon };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error getting accessibility tree: ${e}` };
  }
}

export const accessibilityResource: ResourceDefinition = {
  name: 'session-current-accessibility',
  uri: 'wdio://session/current/accessibility',
  description: 'Accessibility tree for the current page. Returns all elements by default.',
  handler: async () => {
    const result = await readAccessibilityTree({});
    return { contents: [{ uri: 'wdio://session/current/accessibility', mimeType: result.mimeType, text: result.text }] };
  },
};