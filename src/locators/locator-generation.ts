/**
 * Generate multiple locator strategies for an element
 *
 * Based on: https://github.com/appium/appium-mcp/blob/main/src/locators/locator-generation.ts
 */

import type { JSONElement, UniquenessResult } from './source-parsing';
import { checkXPathUniqueness, evaluateXPath, isAttributeUnique } from './source-parsing';

/**
 * Context for locator generation - carries DOM state
 */
export interface LocatorContext {
  sourceXML: string;
  parsedDOM: Document | null;
  isAndroid: boolean;
}

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
 * Escape value for use in XPath expressions
 * Handles values containing both single and double quotes using concat()
 */
function escapeXPathValue(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  // Value contains both quotes - use concat()
  const parts: string[] = [];
  let current = '';
  for (const char of value) {
    if (char === "'") {
      if (current) parts.push(`'${current}'`);
      parts.push('"\'"');
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(`'${current}'`);
  return `concat(${parts.join(',')})`;
}

/**
 * Wrap non-unique XPath with index: //button[@text="OK"] → (//button[@text="OK"])[2]
 */
function generateIndexedXPath(baseXPath: string, index: number): string {
  return `(${baseXPath})[${index}]`;
}

/**
 * Add .instance(n) for UiAutomator: new UiSelector().text("OK") → new UiSelector().text("OK").instance(1)
 * Note: UiAutomator instance() is 0-based
 */
function generateIndexedUiAutomator(baseSelector: string, index: number): string {
  // UiAutomator uses 0-based indexing, XPath uses 1-based
  return `${baseSelector}.instance(${index - 1})`;
}

/**
 * Add XPath locator with uniqueness checking and fallbacks
 * Handles indexed XPath and hierarchical XPath generation
 */
function addXPathLocator(
  results: [LocatorStrategy, string][],
  xpath: string,
  ctx: LocatorContext,
  targetNode?: Node,
): void {
  const uniqueness = checkUniqueness(ctx, xpath, targetNode);
  if (uniqueness.isUnique) {
    results.push(['xpath', xpath]);
  } else if (uniqueness.index) {
    results.push(['xpath', generateIndexedXPath(xpath, uniqueness.index)]);
  } else {
    // XPath not unique and no index - try hierarchical XPath
    if (targetNode && ctx.parsedDOM) {
      const hierarchical = buildHierarchicalXPath(ctx, targetNode as Element);
      if (hierarchical) {
        results.push(['xpath', hierarchical]);
      }
    }
    // Still add the non-unique xpath as last resort
    results.push(['xpath', xpath]);
  }
}

/**
 * Check if element is within UiAutomator scope
 * UiAutomator only works within /hierarchy/*[last()] on Android
 * Elements outside this scope (e.g., in status bar) need XPath fallback
 */
function isInUiAutomatorScope(element: JSONElement, doc: Document | null): boolean {
  if (!doc) return true; // Assume in scope if no DOM available

  // Get hierarchy children
  const hierarchyNodes = evaluateXPath(doc, '/hierarchy/*');
  if (hierarchyNodes.length === 0) return true; // No hierarchy, assume in scope

  // The last child of /hierarchy is the app content
  // UiAutomator can only interact with elements in this subtree
  const lastIndex = hierarchyNodes.length;

  // Element path starts with index into hierarchy children
  // e.g., path "0.1.2" means child 0 of hierarchy
  const pathParts = element.path.split('.');
  if (pathParts.length === 0 || pathParts[0] === '') return true;

  const firstIndex = parseInt(pathParts[0], 10);

  // Element is in scope if it's in the last hierarchy child
  // (index is 0-based, so lastIndex - 1 is the last child)
  return firstIndex === lastIndex - 1;
}

/**
 * Get sibling index (1-based) among same-tag siblings
 */
function getSiblingIndex(element: Element): number {
  const parent = element.parentNode;
  if (!parent) return 1;

  const tagName = element.nodeName;
  let index = 0;

  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes.item(i);
    if (child?.nodeType === 1 && child.nodeName === tagName) {
      index++;
      if (child === element) return index;
    }
  }

  return 1;
}

/**
 * Find unique attribute for element in XPath format
 * @returns Attribute selector like @resource-id="value" or null if none unique
 */
function findUniqueAttribute(
  element: Element,
  ctx: LocatorContext,
): string | null {
  const attrs = ctx.isAndroid
    ? ['resource-id', 'content-desc', 'text']
    : ['name', 'label', 'value'];

  for (const attr of attrs) {
    const value = element.getAttribute(attr);
    if (value && value.trim()) {
      const xpath = `//*[@${attr}=${escapeXPathValue(value)}]`;
      const result = ctx.parsedDOM
        ? checkXPathUniqueness(ctx.parsedDOM, xpath)
        : { isUnique: isAttributeUnique(ctx.sourceXML, attr, value) };

      if (result.isUnique) {
        return `@${attr}=${escapeXPathValue(value)}`;
      }
    }
  }

  return null;
}

/**
 * Build hierarchical XPath by traversing up the DOM tree
 * Creates paths like: //parent[@id="x"]/child[2]/target
 */
function buildHierarchicalXPath(
  ctx: LocatorContext,
  element: Element,
  maxDepth: number = 3,
): string | null {
  if (!ctx.parsedDOM) return null;

  const pathParts: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    const tagName = current.nodeName;
    const uniqueAttr = findUniqueAttribute(current, ctx);

    if (uniqueAttr) {
      // Found unique attribute - we can stop here
      pathParts.unshift(`//${tagName}[${uniqueAttr}]`);
      break;
    } else {
      // Use sibling index
      const siblingIndex = getSiblingIndex(current);
      const siblingCount = countSiblings(current);

      if (siblingCount > 1) {
        pathParts.unshift(`${tagName}[${siblingIndex}]`);
      } else {
        pathParts.unshift(tagName);
      }
    }

    const parent = current.parentNode as Element | null;
    // Stop at non-element nodes
    current = (parent && parent.nodeType === 1) ? parent : null;
    depth++;
  }

  if (pathParts.length === 0) return null;

  // Join parts - first part already has // prefix if it found unique attr
  let result = pathParts[0];
  for (let i = 1; i < pathParts.length; i++) {
    result += '/' + pathParts[i];
  }

  // If no unique attr found, prefix with //
  if (!result.startsWith('//')) {
    result = '//' + result;
  }

  return result;
}

/**
 * Count siblings with same tag name
 */
function countSiblings(element: Element): number {
  const parent = element.parentNode;
  if (!parent) return 1;

  const tagName = element.nodeName;
  let count = 0;

  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes.item(i);
    if (child?.nodeType === 1 && child.nodeName === tagName) {
      count++;
    }
  }

  return count;
}

/**
 * Get simple locators based on single attributes
 * These are preferred because they're most stable and readable
 */
function getSimpleSuggestedLocators(
  element: JSONElement,
  ctx: LocatorContext,
  automationName: string,
  targetNode?: Node,
): [LocatorStrategy, string][] {
  const results: [LocatorStrategy, string][] = [];
  const isAndroid = automationName.toLowerCase().includes('uiautomator');
  const attrs = element.attributes;

  // Check if element is in UiAutomator scope (Android only)
  const inUiAutomatorScope = isAndroid ? isInUiAutomatorScope(element, ctx.parsedDOM) : true;

  if (isAndroid) {
    // Android simple locators

    // 1. Resource ID (most stable)
    const resourceId = attrs['resource-id'];
    if (isValidValue(resourceId)) {
      const xpath = `//*[@resource-id="${resourceId}"]`;
      const uniqueness = checkUniqueness(ctx, xpath, targetNode);

      if (uniqueness.isUnique && inUiAutomatorScope) {
        results.push(['id', `android=new UiSelector().resourceId("${resourceId}")`]);
      } else if (uniqueness.index && inUiAutomatorScope) {
        // Generate indexed UiAutomator selector
        const base = `android=new UiSelector().resourceId("${resourceId}")`;
        results.push(['id', generateIndexedUiAutomator(base, uniqueness.index)]);
      }
    }

    // 2. Content Description (accessibility)
    const contentDesc = attrs['content-desc'];
    if (isValidValue(contentDesc)) {
      const xpath = `//*[@content-desc="${contentDesc}"]`;
      const uniqueness = checkUniqueness(ctx, xpath, targetNode);

      if (uniqueness.isUnique) {
        results.push(['accessibility-id', `~${contentDesc}`]);
      }
      // Note: accessibility-id (~) doesn't support indexing, skip if not unique
    }

    // 3. Text (visible text)
    const text = attrs.text;
    if (isValidValue(text) && text.length < 100) {
      const xpath = `//*[@text="${escapeText(text)}"]`;
      const uniqueness = checkUniqueness(ctx, xpath, targetNode);

      if (uniqueness.isUnique && inUiAutomatorScope) {
        results.push(['text', `android=new UiSelector().text("${escapeText(text)}")`]);
      } else if (uniqueness.index && inUiAutomatorScope) {
        const base = `android=new UiSelector().text("${escapeText(text)}")`;
        results.push(['text', generateIndexedUiAutomator(base, uniqueness.index)]);
      }
    }
  } else {
    // iOS simple locators

    // 1. Accessibility ID (name attribute)
    const name = attrs.name;
    if (isValidValue(name)) {
      const xpath = `//*[@name="${name}"]`;
      const uniqueness = checkUniqueness(ctx, xpath, targetNode);

      if (uniqueness.isUnique) {
        results.push(['accessibility-id', `~${name}`]);
      }
      // Note: accessibility-id (~) doesn't support indexing
    }

    // 2. Label (visible text, often same as name)
    const label = attrs.label;
    if (isValidValue(label) && label !== attrs.name) {
      const xpath = `//*[@label="${escapeText(label)}"]`;
      const uniqueness = checkUniqueness(ctx, xpath, targetNode);

      if (uniqueness.isUnique) {
        results.push(['predicate-string', `-ios predicate string:label == "${escapeText(label)}"`]);
      }
      // Note: predicate-string doesn't have native indexing - XPath fallback will handle
    }

    // 3. Value
    const value = attrs.value;
    if (isValidValue(value)) {
      const xpath = `//*[@value="${escapeText(value)}"]`;
      const uniqueness = checkUniqueness(ctx, xpath, targetNode);

      if (uniqueness.isUnique) {
        results.push(['predicate-string', `-ios predicate string:value == "${escapeText(value)}"`]);
      }
    }
  }

  return results;
}

/**
 * Check uniqueness, falling back to regex if no DOM available
 */
function checkUniqueness(
  ctx: LocatorContext,
  xpath: string,
  targetNode?: Node,
): UniquenessResult {
  if (ctx.parsedDOM) {
    return checkXPathUniqueness(ctx.parsedDOM, xpath, targetNode);
  }

  // Fallback to regex-based check (no index info available)
  // Extract attribute and value from xpath pattern //*[@attr="value"]
  const match = xpath.match(/\/\/\*\[@([^=]+)="([^"]+)"\]/);
  if (match) {
    const [, attr, value] = match;
    return { isUnique: isAttributeUnique(ctx.sourceXML, attr, value) };
  }
  return { isUnique: false };
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
  ctx: LocatorContext,
  automationName: string,
  targetNode?: Node,
): [LocatorStrategy, string][] {
  const results: [LocatorStrategy, string][] = [];
  const isAndroid = automationName.toLowerCase().includes('uiautomator');

  // Check if element is in UiAutomator scope (Android only)
  const inUiAutomatorScope = isAndroid ? isInUiAutomatorScope(element, ctx.parsedDOM) : true;

  if (isAndroid) {
    // Android complex locators

    // UiAutomator with multiple attributes (only if in scope)
    if (inUiAutomatorScope) {
      const uiAutomator = buildUiAutomatorSelector(element);
      if (uiAutomator) {
        results.push(['uiautomator', uiAutomator]);
      }
    }

    // XPath with uniqueness checking
    const xpath = buildXPath(element, ctx.sourceXML, true);
    if (xpath) {
      addXPathLocator(results, xpath, ctx, targetNode);
    }

    // Class name (least specific, only if in scope)
    if (inUiAutomatorScope && isValidValue(element.attributes.class)) {
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

    // XPath with uniqueness checking
    const xpath = buildXPath(element, ctx.sourceXML, false);
    if (xpath) {
      addXPathLocator(results, xpath, ctx, targetNode);
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
 *
 * @param element - JSONElement from parsed page source
 * @param sourceXML - Original XML string (used for regex fallback)
 * @param automationName - Automation driver name (uiautomator2/xcuitest)
 * @param ctx - Optional locator context with cached DOM (for performance)
 * @param targetNode - Optional DOM node for this element (for indexed locators)
 */
export function getSuggestedLocators(
  element: JSONElement,
  sourceXML: string,
  automationName: string,
  ctx?: LocatorContext,
  targetNode?: Node,
): [LocatorStrategy, string][] {
  // Create context if not provided
  const locatorCtx = ctx ?? {
    sourceXML,
    parsedDOM: null,
    isAndroid: automationName.toLowerCase().includes('uiautomator'),
  };

  // Get simple (single attribute) locators first
  const simpleLocators = getSimpleSuggestedLocators(element, locatorCtx, automationName, targetNode);

  // Get complex (combination) locators
  const complexLocators = getComplexSuggestedLocators(element, locatorCtx, automationName, targetNode);

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
  automationName: string,
): string | null {
  const locators = getSuggestedLocators(element, sourceXML, automationName);
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
