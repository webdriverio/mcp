/**
 * Locators module
 * Provides XML parsing and locator generation for mobile elements
 */

export {
  xmlToJSON,
  xmlToDOM,
  parseAndroidBounds,
  parseIOSBounds,
  flattenElementTree,
  evaluateXPath,
  checkXPathUniqueness,
  findDOMNodeByPath,
  isAttributeUnique,
  countAttributeOccurrences,
} from './source-parsing';
export type { JSONElement, ElementAttributes, UniquenessResult } from './source-parsing';

export {
  shouldIncludeElement,
  isInteractableElement,
  isLayoutContainer,
  hasMeaningfulContent,
  getDefaultFilters,
  ANDROID_INTERACTABLE_TAGS,
  ANDROID_LAYOUT_CONTAINERS,
  IOS_INTERACTABLE_TAGS,
  IOS_LAYOUT_CONTAINERS,
} from './element-filter';
export type { FilterOptions } from './element-filter';

export {
  getSuggestedLocators,
  getBestLocator,
  locatorsToObject,
} from './locator-generation';
export type { LocatorStrategy, LocatorContext } from './locator-generation';

export { generateAllElementLocators } from './generate-all-locators';
export type { ElementWithLocators, GenerateLocatorsOptions } from './generate-all-locators';
