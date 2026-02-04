/**
 * Element snapshot utilities for browser and mobile
 *
 * Lightweight subpath export - does NOT include MCP server dependencies
 * Usage: import { getBrowserElements, getMobileVisibleElements } from '@wdio/mcp/snapshot'
 */

// Browser element detection (self-contained script, no external deps)
export { default as getBrowserElementsScript } from './scripts/get-interactable-browser-elements';

// Mobile element detection (requires xmldom + xpath)
export {
  getMobileVisibleElements,
  type MobileElementInfo,
  type GetMobileElementsOptions,
} from './scripts/get-visible-mobile-elements';

// Locator utilities (for advanced usage)
export {
  // Types
  type ElementAttributes,
  type JSONElement,
  type Bounds,
  type FilterOptions,
  type LocatorStrategy,
  type LocatorContext,
  type ElementWithLocators,
  type GenerateLocatorsOptions,

  // Core functions
  generateAllElementLocators,
  getSuggestedLocators,
  getBestLocator,
  getDefaultFilters,

  // XML utilities
  xmlToJSON,
  xmlToDOM,
  parseAndroidBounds,
  parseIOSBounds,
} from './locators';
