/**
 * Element snapshot utilities for browser and mobile
 *
 * Lightweight subpath export - does NOT include MCP server dependencies
 * Usage: import { getBrowserAccessibilityTree, getBrowserInteractableElements, getMobileVisibleElements } from '@wdio/mcp/snapshot'
 */

// Browser accessibility tree
export { getBrowserAccessibilityTree, type AccessibilityNode } from './scripts/get-browser-accessibility-tree';

// Browser interactable elements
export {
  getBrowserInteractableElements,
  type BrowserElementInfo,
  type GetBrowserElementsOptions,
  type ElementType,
} from './scripts/get-interactable-browser-elements';

// Mobile element detection (requires xmldom + xpath)
export {
  getMobileVisibleElements,
  type MobileElementInfo,
  type GetMobileElementsOptions,
} from './scripts/get-visible-mobile-elements';
