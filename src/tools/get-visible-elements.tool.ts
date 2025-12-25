import { getBrowser } from './browser.tool';
import getInteractableElements from '../scripts/get-interactable-elements';
import { getMobileVisibleElements } from '../utils/mobile-elements';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import { encode } from '@toon-format/toon';
import { z } from 'zod';

/**
 * Arguments for get_visible_elements tool
 */
export const getVisibleElementsToolArguments = {
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
};

/**
 * Get visible interactive elements on the current screen
 * Supports both web browsers and mobile apps (iOS/Android)
 */
export const getVisibleElementsTool: ToolCallback = async (args: {
  inViewportOnly?: boolean;
  includeContainers?: boolean;
}) => {
  try {
    const browser = getBrowser();
    const { inViewportOnly = true, includeContainers = false } = args || {};

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

      return {
        content: [{ type: 'text', text: encode(elements) }],
      };
    }

    // Web browser - use existing implementation
    // Note: Web implementation already filters to visible/interactable elements
    const elements = await browser.execute(getInteractableElements);

    // Filter by viewport for web if needed
    if (inViewportOnly) {
      const filteredElements = elements.filter((el: any) => el.isInViewport !== false);
      return {
        content: [{ type: 'text', text: encode(filteredElements) }],
      };
    }

    return {
      content: [{ type: 'text', text: encode(elements) }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting visible elements: ${e}` }],
    };
  }
};
