/**
 * Mobile element detection utilities for iOS and Android
 *
 * Uses page source parsing for optimal performance (2 HTTP calls vs 600+ for 50 elements)
 */

import type { ElementWithLocators, FilterOptions } from '../locators';
import { generateAllElementLocators, getDefaultFilters } from '../locators';

/**
 * Element info returned by getMobileVisibleElements
 */
export interface MobileElementInfo {
  selector: string;
  alternativeSelectors?: string[];
  locators: Record<string, string>;
  tagName?: string;
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  accessibilityId?: string;
  label?: string;
  value?: string;
  className?: string;
  isInViewport: boolean;
  isEnabled: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * Options for getMobileVisibleElements
 */
export interface GetMobileElementsOptions {
  includeContainers?: boolean;
  filterOptions?: FilterOptions;
}

/**
 * Convert ElementWithLocators to MobileElementInfo
 */
function toMobileElementInfo(element: ElementWithLocators): MobileElementInfo {
  const locatorValues = Object.values(element.locators);

  return {
    selector: locatorValues[0] || '',
    alternativeSelectors: locatorValues.length > 1 ? locatorValues.slice(1, 3) : undefined,
    locators: element.locators,
    isInViewport: element.isInViewport,
    isEnabled: element.enabled,
    bounds: element.bounds,
    tagName: element.tagName || undefined,
    text: element.text || undefined,
    resourceId: element.resourceId || undefined,
    contentDesc: element.contentDesc || undefined,
    accessibilityId: element.accessibilityId || undefined,
    label: element.label || undefined,
    value: element.value || undefined,
    className: element.className || undefined,
  };
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
  const { includeContainers = false, filterOptions } = options;

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

  return elements.map(toMobileElementInfo);
}
