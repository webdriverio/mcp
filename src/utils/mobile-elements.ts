/**
 * Mobile element detection utilities for iOS and Android
 *
 * Uses page source parsing for optimal performance (2 HTTP calls vs 600+ for 50 elements)
 */

import type { ElementWithLocators, FilterOptions, LocatorStrategy } from '../locators';
import { generateAllElementLocators, getDefaultFilters } from '../locators';

/**
 * Element info returned by getMobileVisibleElements
 * Only includes fields that have actual values (no nulls/undefined)
 */
export interface MobileElementInfo {
  selector: string;
  tagName: string;
  isInViewport: boolean;
  // Optional fields - only present when they have meaningful values
  text?: string;
  resourceId?: string;
  accessibilityId?: string;
  isEnabled?: boolean;
  alternativeSelectors?: string[];
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * Options for getMobileVisibleElements
 */
export interface GetMobileElementsOptions {
  includeContainers?: boolean;
  includeBounds?: boolean;
  filterOptions?: FilterOptions;
}

/**
 * Locator strategy priority order for selecting best selector
 * Earlier = higher priority
 */
const LOCATOR_PRIORITY: LocatorStrategy[] = [
  'accessibility-id', // Most stable, cross-platform
  'id', // Android resource-id
  'text', // Text-based (can be fragile but readable)
  'predicate-string', // iOS predicate
  'class-chain', // iOS class chain
  'uiautomator', // Android UiAutomator compound
  'xpath', // XPath (last resort, brittle)
  // 'class-name' intentionally excluded - too generic
];

/**
 * Select best locators from available strategies
 * Returns [primarySelector, ...alternativeSelectors]
 */
function selectBestLocators(locators: Record<string, string>): string[] {
  const selected: string[] = [];

  // Find primary selector based on priority
  for (const strategy of LOCATOR_PRIORITY) {
    if (locators[strategy]) {
      selected.push(locators[strategy]);
      break;
    }
  }

  // Add one alternative if available (different strategy)
  for (const strategy of LOCATOR_PRIORITY) {
    if (locators[strategy] && !selected.includes(locators[strategy])) {
      selected.push(locators[strategy]);
      break;
    }
  }

  return selected;
}

/**
 * Convert ElementWithLocators to MobileElementInfo
 * Only includes fields with actual values (mirrors browser script behavior)
 */
function toMobileElementInfo(element: ElementWithLocators, includeBounds: boolean): MobileElementInfo {
  const selectedLocators = selectBestLocators(element.locators);

  // Start with required fields
  const info: MobileElementInfo = {
    selector: selectedLocators[0] || '',
    tagName: element.tagName,
    isInViewport: element.isInViewport,
  };

  // Only add optional fields if they have meaningful values
  if (element.text) {
    info.text = element.text;
  }

  if (element.resourceId) {
    info.resourceId = element.resourceId;
  }

  // Use contentDesc for accessibilityId on Android, or name on iOS
  const accessId = element.accessibilityId || element.contentDesc;
  if (accessId) {
    info.accessibilityId = accessId;
  }

  // Only include isEnabled if it's false (true is the common case)
  if (!element.enabled) {
    info.isEnabled = false;
  }

  // Only add alternative selectors if we have more than one
  if (selectedLocators.length > 1) {
    info.alternativeSelectors = selectedLocators.slice(1);
  }

  // Only include bounds if explicitly requested
  if (includeBounds) {
    info.bounds = element.bounds;
  }

  return info;
}

/**
 * Get viewport size from browser
 */
async function getViewportSize(browser: WebdriverIO.Browser): Promise<{ width: number; height: number }> {
  try {
    const size = await browser.getWindowSize();
    return { width: size.width, height: size.height };
  } catch {
    return { width: 9999, height: 9999 };
  }
}

/**
 * Get all visible elements from a mobile app
 *
 * Performance: 2 HTTP calls (getWindowSize + getPageSource) vs 12+ per element with legacy approach
 */
export async function getMobileVisibleElements(
  browser: WebdriverIO.Browser,
  platform: 'ios' | 'android',
  options: GetMobileElementsOptions = {},
): Promise<MobileElementInfo[]> {
  const { includeContainers = false, includeBounds = false, filterOptions } = options;

  const viewportSize = await getViewportSize(browser);
  const pageSource = await browser.getPageSource();

  const filters: FilterOptions = {
    ...getDefaultFilters(platform, includeContainers),
    ...filterOptions,
  };

  const elements = generateAllElementLocators(pageSource, {
    platform,
    viewportSize,
    filters,
  });

  return elements.map((el) => toMobileElementInfo(el, includeBounds));
}
