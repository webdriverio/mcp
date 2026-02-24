/**
 * Element snapshot utilities for browser and mobile
 *
 * Lightweight subpath export — does NOT include MCP server dependencies
 * Usage: import { getInteractableBrowserElements, getMobileVisibleElements } from '@wdio/mcp/snapshot'
 */

// Browser element detection
export {
  getInteractableBrowserElements,
  type BrowserElementInfo,
  type GetBrowserElementsOptions,
} from './scripts/get-interactable-browser-elements';

// Browser accessibility tree
export {
  getBrowserAccessibilityTree,
  type AccessibilityNode,
} from './scripts/get-browser-accessibility-tree';

// Mobile element detection (requires xmldom + xpath)
export {
  getMobileVisibleElements,
  type MobileElementInfo,
  type GetMobileElementsOptions,
} from './scripts/get-visible-mobile-elements';
