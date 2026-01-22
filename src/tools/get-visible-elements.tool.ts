import { getBrowser } from './browser.tool';
import getInteractableElements from '../scripts/get-interactable-elements';
import { getMobileVisibleElements } from '../utils/mobile-elements';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';
import { encode } from '@toon-format/toon';
import { z } from 'zod';
import { stripUndefinedFromArray } from '../utils/strip-undefined';

/**
 * Tool definition for get_visible_elements
 */
export const getVisibleElementsToolDefinition: ToolDefinition = {
  name: 'get_visible_elements',
  description: 'get a list of visible (in viewport & displayed) interactable elements on the page (buttons, links, inputs). Use elementType="visual" for images/SVGs. Must prefer this to take_screenshot for interactions',
  inputSchema: {
    inViewportOnly: z
      .boolean()
      .optional()
      .describe(
        'Only return elements within the visible viewport. Default: true. Set to false to get ALL elements on the page.',
      ),
    includeContainers: z
      .boolean()
      .optional()
      .describe(
        'Include layout containers (ViewGroup, FrameLayout, ScrollView, etc). Default: false. Set to true to see all elements including layouts.',
      ),
    includeBounds: z
      .boolean()
      .optional()
      .describe(
        'Include element bounds/coordinates (x, y, width, height). Default: false. Set to true for coordinate-based interactions or layout debugging.',
      ),
    elementType: z
      .enum(['interactable', 'visual', 'all'])
      .optional()
      .describe(
        'Type of elements to return: "interactable" (default) for buttons/links/inputs, "visual" for images/SVGs, "all" for both.',
      ),
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
  elementType?: 'interactable' | 'visual' | 'all';
  limit?: number;
  offset?: number;
}) => {
  try {
    const browser = getBrowser();
    const {
      inViewportOnly = true,
      includeContainers = false,
      includeBounds = false,
      elementType = 'interactable',
      limit = 0,
      offset = 0,
    } = args || {};

    let elements: { isInViewport?: boolean }[];

    if (browser.isAndroid || browser.isIOS) {
      const platform = browser.isAndroid ? 'android' : 'ios';
      elements = await getMobileVisibleElements(browser, platform, { includeContainers, includeBounds });
    } else {
      const raw = await browser.execute(getInteractableElements, elementType);
      elements = stripUndefinedFromArray(raw);
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

    const result = {
      total,
      showing: elements.length,
      hasMore: offset + elements.length < total,
      elements,
    };

    return {
      content: [{ type: 'text', text: encode(result) }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting visible elements: ${e}` }],
    };
  }
};