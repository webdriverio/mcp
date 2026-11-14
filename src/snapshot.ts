/**
 * Element snapshot utilities for browser and mobile
 *
 * Lightweight subpath export — does NOT include MCP server dependencies
 * Usage: import { getInteractableBrowserElements, getMobileVisibleElements } from '@wdio/mcp/snapshot'
 */

import { warnDeprecated } from './utils/deprecation';
import { getInteractableBrowserElements as getInteractableBrowserElementsImpl } from './scripts/get-interactable-browser-elements';
import type { BrowserElementInfo as BrowserElementInfoImpl, GetBrowserElementsOptions as GetBrowserElementsOptionsImpl } from './scripts/get-interactable-browser-elements';
import { getBrowserAccessibilityTree as getBrowserAccessibilityTreeImpl } from './scripts/get-browser-accessibility-tree';
import type { AccessibilityNode as AccessibilityNodeImpl } from './scripts/get-browser-accessibility-tree';
import { getMobileVisibleElements as getMobileVisibleElementsImpl } from './scripts/get-visible-mobile-elements';
import type { MobileElementInfo as MobileElementInfoImpl, GetMobileElementsOptions as GetMobileElementsOptionsImpl } from './scripts/get-visible-mobile-elements';

warnDeprecated('snapshot');

// Browser element detection
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export const getInteractableBrowserElements = getInteractableBrowserElementsImpl;
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export type BrowserElementInfo = BrowserElementInfoImpl;
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export type GetBrowserElementsOptions = GetBrowserElementsOptionsImpl;

// Browser accessibility tree
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export const getBrowserAccessibilityTree = getBrowserAccessibilityTreeImpl;
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export type AccessibilityNode = AccessibilityNodeImpl;

// Mobile element detection (requires xmldom + xpath)
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export const getMobileVisibleElements = getMobileVisibleElementsImpl;
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export type MobileElementInfo = MobileElementInfoImpl;
/** @deprecated Removed in @wdio/mcp v5. Use @wdio/snapshot. */
export type GetMobileElementsOptions = GetMobileElementsOptionsImpl;
