/**
 * Generate multiple locator strategies for an element
 *
 * Based on: https://github.com/appium/appium-mcp/blob/main/src/locators/locator-generation.ts
 */

import type { JSONElement } from './source-parsing';
import { isAttributeUnique } from './source-parsing';

export type LocatorStrategy =
  | 'accessibility-id'
  | 'id'
  | 'class-name'
  | 'xpath'
  | 'predicate-string'
  | 'class-chain'
  | 'uiautomator'
  | 'text';

/**
 * Check if a string value is valid for use in a locator
 */
function isValidValue(value: string | undefined): value is string {
  return value !== undefined && value !== null && value !== 'null' && value.trim() !== '';
}

/**
 * Escape special characters in text for use in selectors
 */
function escapeText(text: string): string {
  return text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Get simple locators based on single attributes
 * These are preferred because they're most stable and readable
 */
function getSimpleSuggestedLocators(
  element: JSONElement,
  sourceXML: string,
  isNative: boolean,
  automationName: string,
): [LocatorStrategy, string][] {
  const results: [LocatorStrategy, string][] = [];
  const isAndroid = automationName.toLowerCase().includes('uiautomator');
  const attrs = element.attributes;

  if (isAndroid) {
    // Android simple locators

    // 1. Resource ID (most stable)
    const resourceId = attrs['resource-id'];
    if (isValidValue(resourceId) && isAttributeUnique(sourceXML, 'resource-id', resourceId)) {
      results.push(['id', `android=new UiSelector().resourceId("${resourceId}")`]);
    }

    // 2. Content Description (accessibility)
    const contentDesc = attrs['content-desc'];
    if (isValidValue(contentDesc) && isAttributeUnique(sourceXML, 'content-desc', contentDesc)) {
      results.push(['accessibility-id', `~${contentDesc}`]);
    }

    // 3. Text (visible text)
    const text = attrs.text;
    if (isValidValue(text) && text.length < 100 && isAttributeUnique(sourceXML, 'text', text)) {
      results.push(['text', `android=new UiSelector().text("${escapeText(text)}")`]);
    }
  } else {
    // iOS simple locators

    // 1. Accessibility ID (name attribute)
    const name = attrs.name;
    if (isValidValue(name) && isAttributeUnique(sourceXML, 'name', name)) {
      results.push(['accessibility-id', `~${name}`]);
    }

    // 2. Label (visible text, often same as name)
    const label = attrs.label;
    if (isValidValue(label) && label !== name && isAttributeUnique(sourceXML, 'label', label)) {
      results.push(['predicate-string', `-ios predicate string:label == "${escapeText(label)}"`]);
    }

    // 3. Value
    const value = attrs.value;
    if (isValidValue(value) && isAttributeUnique(sourceXML, 'value', value)) {
      results.push(['predicate-string', `-ios predicate string:value == "${escapeText(value)}"`]);
    }
  }

  return results;
}

/**
 * Build Android UiAutomator selector with multiple attributes
 */
function buildUiAutomatorSelector(element: JSONElement): string | null {
  const attrs = element.attributes;
  const parts: string[] = [];

  // Build selector with available attributes
  if (isValidValue(attrs['resource-id'])) {
    parts.push(`resourceId("${attrs['resource-id']}")`);
  }
  if (isValidValue(attrs.text) && attrs.text!.length < 100) {
    parts.push(`text("${escapeText(attrs.text!)}")`);
  }
  if (isValidValue(attrs['content-desc'])) {
    parts.push(`description("${attrs['content-desc']}")`);
  }
  if (isValidValue(attrs.class)) {
    parts.push(`className("${attrs.class}")`);
  }

  if (parts.length === 0) return null;

  return `android=new UiSelector().${parts.join('.')}`;
}

/**
 * Build iOS predicate string with multiple conditions
 */
function buildPredicateString(element: JSONElement): string | null {
  const attrs = element.attributes;
  const conditions: string[] = [];

  if (isValidValue(attrs.name)) {
    conditions.push(`name == "${escapeText(attrs.name!)}"`);
  }
  if (isValidValue(attrs.label)) {
    conditions.push(`label == "${escapeText(attrs.label!)}"`);
  }
  if (isValidValue(attrs.value)) {
    conditions.push(`value == "${escapeText(attrs.value!)}"`);
  }
  if (attrs.visible === 'true') {
    conditions.push('visible == 1');
  }
  if (attrs.enabled === 'true') {
    conditions.push('enabled == 1');
  }

  if (conditions.length === 0) return null;

  // Use AND for multiple conditions
  return `-ios predicate string:${conditions.join(' AND ')}`;
}

/**
 * Build iOS class chain selector
 */
function buildClassChain(element: JSONElement): string | null {
  const attrs = element.attributes;
  const tagName = element.tagName;

  // Simple class chain with type
  if (!tagName.startsWith('XCUI')) return null;

  let selector = `**/${tagName}`;

  // Add label predicate if available
  if (isValidValue(attrs.label)) {
    selector += `[\`label == "${escapeText(attrs.label!)}"\`]`;
  } else if (isValidValue(attrs.name)) {
    selector += `[\`name == "${escapeText(attrs.name!)}"\`]`;
  }

  return `-ios class chain:${selector}`;
}

/**
 * Build XPath for element with unique identification
 */
function buildXPath(element: JSONElement, sourceXML: string, isAndroid: boolean): string | null {
  const attrs = element.attributes;
  const tagName = element.tagName;
  const conditions: string[] = [];

  if (isAndroid) {
    // Android XPath attributes
    if (isValidValue(attrs['resource-id'])) {
      conditions.push(`@resource-id="${attrs['resource-id']}"`);
    }
    if (isValidValue(attrs['content-desc'])) {
      conditions.push(`@content-desc="${attrs['content-desc']}"`);
    }
    if (isValidValue(attrs.text) && attrs.text!.length < 100) {
      conditions.push(`@text="${escapeText(attrs.text!)}"`);
    }
  } else {
    // iOS XPath attributes
    if (isValidValue(attrs.name)) {
      conditions.push(`@name="${attrs.name}"`);
    }
    if (isValidValue(attrs.label)) {
      conditions.push(`@label="${attrs.label}"`);
    }
    if (isValidValue(attrs.value)) {
      conditions.push(`@value="${attrs.value}"`);
    }
  }

  // Build XPath
  if (conditions.length === 0) {
    // Fallback: just the tag
    return `//${tagName}`;
  }

  // Combine conditions with 'and'
  return `//${tagName}[${conditions.join(' and ')}]`;
}

/**
 * Get complex locators (combinations, XPath, etc.)
 */
function getComplexSuggestedLocators(
  element: JSONElement,
  sourceXML: string,
  isNative: boolean,
  automationName: string,
): [LocatorStrategy, string][] {
  const results: [LocatorStrategy, string][] = [];
  const isAndroid = automationName.toLowerCase().includes('uiautomator');

  if (isAndroid) {
    // Android complex locators

    // UiAutomator with multiple attributes
    const uiAutomator = buildUiAutomatorSelector(element);
    if (uiAutomator) {
      results.push(['uiautomator', uiAutomator]);
    }

    // XPath
    const xpath = buildXPath(element, sourceXML, true);
    if (xpath) {
      results.push(['xpath', xpath]);
    }

    // Class name (least specific)
    if (isValidValue(element.attributes.class)) {
      results.push([
        'class-name',
        `android=new UiSelector().className("${element.attributes.class}")`,
      ]);
    }
  } else {
    // iOS complex locators

    // Predicate string with multiple conditions
    const predicate = buildPredicateString(element);
    if (predicate) {
      results.push(['predicate-string', predicate]);
    }

    // Class chain
    const classChain = buildClassChain(element);
    if (classChain) {
      results.push(['class-chain', classChain]);
    }

    // XPath
    const xpath = buildXPath(element, sourceXML, false);
    if (xpath) {
      results.push(['xpath', xpath]);
    }

    // Class name (least specific)
    const type = element.tagName;
    if (type.startsWith('XCUIElementType')) {
      results.push(['class-name', `-ios class chain:**/${type}`]);
    }
  }

  return results;
}

/**
 * Get all suggested locators for an element
 * Returns array of [strategy, value] tuples ordered by priority
 *
 * Priority order:
 * Android: id > accessibility-id > text > xpath > uiautomator > class-name
 * iOS: accessibility-id > predicate-string > class-chain > xpath > class-name
 */
export function getSuggestedLocators(
  element: JSONElement,
  sourceXML: string,
  isNative: boolean,
  automationName: string,
): [LocatorStrategy, string][] {
  // Get simple (single attribute) locators first
  const simpleLocators = getSimpleSuggestedLocators(element, sourceXML, isNative, automationName);

  // Get complex (combination) locators
  const complexLocators = getComplexSuggestedLocators(element, sourceXML, isNative, automationName);

  // Combine, removing duplicates (keep first occurrence)
  const seen = new Set<string>();
  const results: [LocatorStrategy, string][] = [];

  for (const locator of [...simpleLocators, ...complexLocators]) {
    if (!seen.has(locator[1])) {
      seen.add(locator[1]);
      results.push(locator);
    }
  }

  return results;
}

/**
 * Get the best (first priority) locator for an element
 */
export function getBestLocator(
  element: JSONElement,
  sourceXML: string,
  isNative: boolean,
  automationName: string,
): string | null {
  const locators = getSuggestedLocators(element, sourceXML, isNative, automationName);
  return locators.length > 0 ? locators[0][1] : null;
}

/**
 * Convert locator array to object format
 */
export function locatorsToObject(locators: [LocatorStrategy, string][]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [strategy, value] of locators) {
    // Use first locator for each strategy
    if (!result[strategy]) {
      result[strategy] = value;
    }
  }
  return result;
}
