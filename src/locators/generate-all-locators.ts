/**
 * Main orchestrator for generating locators from page source
 *
 * Based on: https://github.com/appium/appium-mcp/blob/main/src/locators/generate-all-locators.ts
 */

import type { LocatorStrategy } from './locator-generation';
import { getSuggestedLocators, locatorsToObject } from './locator-generation';
import type { JSONElement } from './source-parsing';
import { findDOMNodeByPath, parseAndroidBounds, parseIOSBounds, xmlToDOM, xmlToJSON } from './source-parsing';
import type { FilterOptions } from './element-filter';
import { hasMeaningfulContent, isLayoutContainer, shouldIncludeElement } from './element-filter';

export interface ElementWithLocators {
  tagName: string;
  locators: Record<string, string>;
  text: string;
  contentDesc: string;
  resourceId: string;
  accessibilityId: string;
  label: string;
  value: string;
  className: string;
  clickable: boolean;
  enabled: boolean;
  displayed: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  isInViewport: boolean;
}

/**
 * Processing context - carries all shared state through the processing pipeline
 */
interface ProcessingContext {
  sourceXML: string;
  platform: 'android' | 'ios';
  automationName: string;
  isNative: boolean;
  viewportSize: { width: number; height: number };
  filters: FilterOptions;
  results: ElementWithLocators[];
  parsedDOM: Document | null;
}

/**
 * Options for generating element locators
 */
export interface GenerateLocatorsOptions {
  platform: 'android' | 'ios';
  viewportSize?: { width: number; height: number };
  filters?: FilterOptions;
  isNative?: boolean;
}

/**
 * Parse element bounds based on platform
 */
function parseBounds(
  element: JSONElement,
  platform: 'android' | 'ios',
): { x: number; y: number; width: number; height: number } {
  return platform === 'android'
    ? parseAndroidBounds(element.attributes.bounds || '')
    : parseIOSBounds(element.attributes);
}

/**
 * Check if bounds are within viewport
 */
function isWithinViewport(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): boolean {
  return (
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.x + bounds.width <= viewport.width &&
    bounds.y + bounds.height <= viewport.height
  );
}

/**
 * Transform JSONElement to ElementWithLocators
 */
function transformElement(element: JSONElement, locators: [LocatorStrategy, string][], ctx: ProcessingContext): ElementWithLocators {
  const attrs = element.attributes;
  const bounds = parseBounds(element, ctx.platform);

  return {
    tagName: element.tagName,
    locators: locatorsToObject(locators),
    text: attrs.text || attrs.label || '',
    contentDesc: attrs['content-desc'] || '',
    resourceId: attrs['resource-id'] || '',
    accessibilityId: attrs.name || attrs['content-desc'] || '',
    label: attrs.label || '',
    value: attrs.value || '',
    className: attrs.class || element.tagName,
    clickable: attrs.clickable === 'true' || attrs.accessible === 'true' || attrs['long-clickable'] === 'true',
    enabled: attrs.enabled !== 'false',
    displayed: ctx.platform === 'android' ? attrs.displayed !== 'false' : attrs.visible !== 'false',
    bounds,
    isInViewport: isWithinViewport(bounds, ctx.viewportSize),
  };
}

/**
 * Check if element should be processed (passes filters or has meaningful content)
 */
function shouldProcess(element: JSONElement, ctx: ProcessingContext): boolean {
  if (shouldIncludeElement(element, ctx.filters, ctx.isNative, ctx.automationName)) {
    return true;
  }
  // Keep layout containers that have meaningful content
  return isLayoutContainer(element, ctx.platform) && hasMeaningfulContent(element, ctx.platform);
}

/**
 * Process a single element and add to results if valid
 */
function processElement(element: JSONElement, ctx: ProcessingContext): void {
  if (!shouldProcess(element, ctx)) return;

  try {
    // Find DOM node for this element (for indexed locator generation)
    const targetNode = ctx.parsedDOM ? findDOMNodeByPath(ctx.parsedDOM, element.path) : undefined;

    const locators = getSuggestedLocators(
      element,
      ctx.sourceXML,
      ctx.automationName,
      { sourceXML: ctx.sourceXML, parsedDOM: ctx.parsedDOM, isAndroid: ctx.platform === 'android' },
      targetNode || undefined,
    );
    if (locators.length === 0) return;

    const transformed = transformElement(element, locators, ctx);
    if (Object.keys(transformed.locators).length === 0) return;

    ctx.results.push(transformed);
  } catch (error) {
    console.error(`[processElement] Error at path ${element.path}:`, error);
  }
}

/**
 * Recursively traverse and process element tree
 */
function traverseTree(element: JSONElement | null, ctx: ProcessingContext): void {
  if (!element) return;

  processElement(element, ctx);

  for (const child of element.children || []) {
    traverseTree(child, ctx);
  }
}

/**
 * Generate locators for all elements from page source XML
 */
export function generateAllElementLocators(
  sourceXML: string,
  options: GenerateLocatorsOptions,
): ElementWithLocators[] {
  // Parse to JSON tree
  const sourceJSON = xmlToJSON(sourceXML);

  if (!sourceJSON) {
    console.error('[generateAllElementLocators] Failed to parse page source XML');
    return [];
  }

  // Parse DOM for XPath-based uniqueness checking
  const parsedDOM = xmlToDOM(sourceXML);

  const ctx: ProcessingContext = {
    sourceXML,
    platform: options.platform,
    automationName: options.platform === 'android' ? 'uiautomator2' : 'xcuitest',
    isNative: options.isNative ?? true,
    viewportSize: options.viewportSize ?? { width: 9999, height: 9999 },
    filters: options.filters ?? {},
    results: [],
    parsedDOM,
  };

  traverseTree(sourceJSON, ctx);

  return ctx.results;
}
