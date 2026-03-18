import { getBrowser } from './browser.tool';
import { getInteractableBrowserElements } from '../scripts/get-interactable-browser-elements';
import { getMobileVisibleElements } from '../scripts/get-visible-mobile-elements';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';
import { encode } from '@toon-format/toon';
import { z } from 'zod';

/**
 * Tool definition for get_visible_elements
 */
export const getVisibleElementsToolDefinition: ToolDefinition = {
  name: 'get_visible_elements',
  description: 'Get interactable elements on the page (buttons, links, inputs). Use get_accessibility for page structure and non-interactable elements.',
  inputSchema: {
    inViewportOnly: z
      .boolean()
      .optional()
      .describe('Only return elements within the visible viewport. Default: true. Set to false to get ALL elements on the page.'),
    includeContainers: z
      .boolean()
      .optional()
      .describe('Mobile only: include layout containers. Default: false.'),
    includeBounds: z
      .boolean()
      .optional()
      .describe('Include element bounds/coordinates (x, y, width, height). Default: false.'),
    limit: z
      .number()
      .optional()
      .describe('Maximum number of elements to return. Default: 0 (unlimited).'),
    offset: z
      .number()
      .optional()
      .describe('Number of elements to skip (for pagination). Default: 0.'),
  },
};

/**
 * Get visible elements on the current screen
 * Supports both web browsers and mobile apps (iOS/Android)
 */
export const getVisibleElementsTool: ToolCallback = async (args: {
  inViewportOnly?: boolean;
  includeContainers?: boolean;
  includeBounds?: boolean;
  limit?: number;
  offset?: number;
}) => {
  try {
    const browser = getBrowser();
    const {
      inViewportOnly = true,
      includeContainers = false,
      includeBounds = false,
      limit = 0,
      offset = 0,
    } = args || {};

    let elements: { isInViewport?: boolean }[];

    if (browser.isAndroid || browser.isIOS) {
      const platform = browser.isAndroid ? 'android' : 'ios';
      elements = await getMobileVisibleElements(browser, platform, { includeContainers, includeBounds });
    } else {
      elements = await getInteractableBrowserElements(browser, { includeBounds });
    }

    if (inViewportOnly) {
      elements = elements.filter((el) => el.isInViewport !== false);
    }

    const total = elements.length;

    // Apply pagination
    if (offset > 0) {
      elements = elements.slice(offset);
    }
    if (limit > 0) {
      elements = elements.slice(0, limit);
    }

    const result: Record<string, unknown> = {
      total,
      showing: elements.length,
      hasMore: offset + elements.length < total,
      elements,
    };

    // TOON tabular format with post-processing: replace "" with bare commas for efficiency
    const toon = encode(result).replace(/,""/g, ',').replace(/"",/g, ',');
    return {
      content: [{ type: 'text', text: toon }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error getting visible elements: ${e}` }],
    };
  }
};
