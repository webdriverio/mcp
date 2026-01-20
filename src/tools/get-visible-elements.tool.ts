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
    elementType: z
      .enum(['interactable', 'visual', 'all'])
      .optional()
      .describe(
        'Type of elements to return: "interactable" (default) for buttons/links/inputs, "visual" for images/SVGs, "all" for both.',
      ),
    limit: z
      .number()
      .optional()
      .describe(
        'Maximum number of elements to return. Default: 0 (unlimited). Set a limit for pages with many elements.',
      ),
  },
};

/**
 * Get visible elements on the current screen
 * Supports both web browsers and mobile apps (iOS/Android)
 */
export const getVisibleElementsTool: ToolCallback = async (args: {
  inViewportOnly?: boolean;
  includeContainers?: boolean;
  elementType?: 'interactable' | 'visual' | 'all';
  limit?: number;
}) => {
  try {
    const browser = getBrowser();
    const {
      inViewportOnly = true,
      includeContainers = false,
      elementType = 'interactable',
      limit = 0,
    } = args || {};

    // Handle mobile apps differently from web browsers
    if (browser.isAndroid || browser.isIOS) {
      const platform = browser.isAndroid ? 'android' : 'ios';
      let elements = await getMobileVisibleElements(browser, platform, {
        includeContainers,
      });

      // Filter by viewport if requested (default: true)
      if (inViewportOnly) {
        elements = elements.filter((el) => el.isInViewport);
      }

      // Apply limit (0 means unlimited)
      if (limit > 0 && elements.length > limit) {
        elements = elements.slice(0, limit);
      }

      return {
        content: [{ type: 'text', text: encode(elements) }],
      };
    }

    // Web browser - pass elementType to browser script
    let elements = await browser.execute(getInteractableElements, elementType);

    // Filter by viewport for web if needed
    if (inViewportOnly) {
      elements = elements.filter((el: any) => el.isInViewport !== false);
    }

    // Apply limit (0 means unlimited)
    if (limit > 0 && elements.length > limit) {
      elements = elements.slice(0, limit);
    }

    // Strip any remaining undefined values (browser script already does this, but safety net)
    const cleanedElements = stripUndefinedFromArray(elements);

    return {
      content: [{ type: 'text', text: encode(cleanedElements) }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting visible elements: ${e}` }],
    };
  }
};