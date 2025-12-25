/**
 * Element filtering logic for mobile platforms
 *
 * Based on: https://github.com/appium/appium-mcp/blob/main/src/locators/element-filter.ts
 */

import type { JSONElement } from './source-parsing';

export interface FilterOptions {
  includeTagNames?: string[]; // Only include these tags (whitelist)
  excludeTagNames?: string[]; // Exclude these tags (blacklist)
  requireAttributes?: string[]; // Must have at least one of these attributes
  minAttributeCount?: number; // Minimum number of non-empty attributes
  fetchableOnly?: boolean; // Only interactable elements
  clickableOnly?: boolean; // Only elements with clickable="true"
  visibleOnly?: boolean; // Only visible/displayed elements
}

/**
 * Android interactive element types
 */
export const ANDROID_INTERACTABLE_TAGS = [
  // Input elements
  'android.widget.EditText',
  'android.widget.AutoCompleteTextView',
  'android.widget.MultiAutoCompleteTextView',
  'android.widget.SearchView',

  // Button-like elements
  'android.widget.Button',
  'android.widget.ImageButton',
  'android.widget.ToggleButton',
  'android.widget.CompoundButton',
  'android.widget.RadioButton',
  'android.widget.CheckBox',
  'android.widget.Switch',
  'android.widget.FloatingActionButton',
  'com.google.android.material.button.MaterialButton',
  'com.google.android.material.floatingactionbutton.FloatingActionButton',

  // Text elements (often tappable)
  'android.widget.TextView',
  'android.widget.CheckedTextView',

  // Image elements (often tappable)
  'android.widget.ImageView',
  'android.widget.QuickContactBadge',

  // Selection elements
  'android.widget.Spinner',
  'android.widget.SeekBar',
  'android.widget.RatingBar',
  'android.widget.ProgressBar',
  'android.widget.DatePicker',
  'android.widget.TimePicker',
  'android.widget.NumberPicker',

  // List/grid items
  'android.widget.AdapterView',
];

/**
 * iOS interactive element types
 */
export const IOS_INTERACTABLE_TAGS = [
  // Input elements
  'XCUIElementTypeTextField',
  'XCUIElementTypeSecureTextField',
  'XCUIElementTypeTextView',
  'XCUIElementTypeSearchField',

  // Button-like elements
  'XCUIElementTypeButton',
  'XCUIElementTypeLink',

  // Text elements (often tappable)
  'XCUIElementTypeStaticText',

  // Image elements
  'XCUIElementTypeImage',
  'XCUIElementTypeIcon',

  // Selection elements
  'XCUIElementTypeSwitch',
  'XCUIElementTypeSlider',
  'XCUIElementTypeStepper',
  'XCUIElementTypeSegmentedControl',
  'XCUIElementTypePicker',
  'XCUIElementTypePickerWheel',
  'XCUIElementTypeDatePicker',
  'XCUIElementTypePageIndicator',

  // Table/list items
  'XCUIElementTypeCell',
  'XCUIElementTypeMenuItem',
  'XCUIElementTypeMenuBarItem',

  // Toggle elements
  'XCUIElementTypeCheckBox',
  'XCUIElementTypeRadioButton',
  'XCUIElementTypeToggle',

  // Other interactive
  'XCUIElementTypeKey',
  'XCUIElementTypeKeyboard',
  'XCUIElementTypeAlert',
  'XCUIElementTypeSheet',
];

/**
 * Android layout containers - typically not interactive targets
 */
export const ANDROID_LAYOUT_CONTAINERS = [
  // Core ViewGroup classes
  'android.view.ViewGroup',
  'android.view.View',
  'android.widget.FrameLayout',
  'android.widget.LinearLayout',
  'android.widget.RelativeLayout',
  'android.widget.GridLayout',
  'android.widget.TableLayout',
  'android.widget.TableRow',
  'android.widget.AbsoluteLayout',

  // AndroidX layout classes
  'androidx.constraintlayout.widget.ConstraintLayout',
  'androidx.coordinatorlayout.widget.CoordinatorLayout',
  'androidx.appcompat.widget.LinearLayoutCompat',
  'androidx.cardview.widget.CardView',
  'androidx.appcompat.widget.ContentFrameLayout',
  'androidx.appcompat.widget.FitWindowsFrameLayout',

  // Scrolling containers
  'android.widget.ScrollView',
  'android.widget.HorizontalScrollView',
  'android.widget.NestedScrollView',
  'androidx.core.widget.NestedScrollView',
  'androidx.recyclerview.widget.RecyclerView',
  'android.widget.ListView',
  'android.widget.GridView',
  'android.widget.AbsListView',

  // App chrome / system elements
  'android.widget.ActionBarContainer',
  'android.widget.ActionBarOverlayLayout',
  'android.view.ViewStub',
  'androidx.appcompat.widget.ActionBarContainer',
  'androidx.appcompat.widget.ActionBarContextView',
  'androidx.appcompat.widget.ActionBarOverlayLayout',

  // Decor views
  'com.android.internal.policy.DecorView',
  'android.widget.DecorView',
];

/**
 * iOS layout containers - typically not interactive targets
 */
export const IOS_LAYOUT_CONTAINERS = [
  // Generic containers
  'XCUIElementTypeOther',
  'XCUIElementTypeGroup',
  'XCUIElementTypeLayoutItem',

  // Scroll containers
  'XCUIElementTypeScrollView',
  'XCUIElementTypeTable',
  'XCUIElementTypeCollectionView',
  'XCUIElementTypeScrollBar',

  // Navigation chrome
  'XCUIElementTypeNavigationBar',
  'XCUIElementTypeTabBar',
  'XCUIElementTypeToolbar',
  'XCUIElementTypeStatusBar',
  'XCUIElementTypeMenuBar',

  // Windows and views
  'XCUIElementTypeWindow',
  'XCUIElementTypeSheet',
  'XCUIElementTypeDrawer',
  'XCUIElementTypeDialog',
  'XCUIElementTypePopover',
  'XCUIElementTypePopUpButton',

  // Outline elements
  'XCUIElementTypeOutline',
  'XCUIElementTypeOutlineRow',
  'XCUIElementTypeBrowser',
  'XCUIElementTypeSplitGroup',
  'XCUIElementTypeSplitter',

  // Application root
  'XCUIElementTypeApplication',
];

/**
 * Check if element tag matches any in the list (handles partial matches)
 */
function matchesTagList(tagName: string, tagList: string[]): boolean {
  // Exact match
  if (tagList.includes(tagName)) {
    return true;
  }

  // Partial match for tags with package prefixes
  for (const tag of tagList) {
    if (tagName.endsWith(tag) || tagName.includes(tag)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if element matches tag name filters
 */
function matchesTagFilters(
  element: JSONElement,
  includeTagNames: string[],
  excludeTagNames: string[],
): boolean {
  // If include list provided, element must match it
  if (includeTagNames.length > 0 && !matchesTagList(element.tagName, includeTagNames)) {
    return false;
  }

  // If element matches exclude list, filter it out
  if (matchesTagList(element.tagName, excludeTagNames)) {
    return false;
  }

  return true;
}

/**
 * Check if element matches attribute-based filters
 */
function matchesAttributeFilters(
  element: JSONElement,
  requireAttributes: string[],
  minAttributeCount: number,
): boolean {
  // Check required attributes
  if (requireAttributes.length > 0) {
    const hasRequiredAttr = requireAttributes.some((attr) => element.attributes?.[attr]);
    if (!hasRequiredAttr) return false;
  }

  // Check minimum attribute count
  if (element.attributes && minAttributeCount > 0) {
    const attrCount = Object.values(element.attributes).filter(
      (v) => v !== undefined && v !== null && v !== '',
    ).length;
    if (attrCount < minAttributeCount) {
      return false;
    }
  }

  return true;
}

/**
 * Check if element is interactable based on platform
 */
export function isInteractableElement(
  element: JSONElement,
  isNative: boolean,
  automationName: string,
): boolean {
  const isAndroid = automationName.toLowerCase().includes('uiautomator');

  const interactableTags = isAndroid ? ANDROID_INTERACTABLE_TAGS : IOS_INTERACTABLE_TAGS;

  // Check if tag is interactable
  if (matchesTagList(element.tagName, interactableTags)) {
    return true;
  }

  // Check clickable/focusable attributes (Android)
  if (isAndroid) {
    if (
      element.attributes?.clickable === 'true' ||
      element.attributes?.focusable === 'true' ||
      element.attributes?.checkable === 'true' ||
      element.attributes?.['long-clickable'] === 'true'
    ) {
      return true;
    }
  }

  // Check accessible attribute (iOS)
  if (!isAndroid) {
    if (element.attributes?.accessible === 'true') {
      return true;
    }
  }

  return false;
}

/**
 * Check if element is a layout container
 */
export function isLayoutContainer(element: JSONElement, platform: 'android' | 'ios'): boolean {
  const containerList = platform === 'android' ? ANDROID_LAYOUT_CONTAINERS : IOS_LAYOUT_CONTAINERS;
  return matchesTagList(element.tagName, containerList);
}

/**
 * Check if element has meaningful content (text, accessibility info)
 * Elements with content should be kept even if they're containers
 */
export function hasMeaningfulContent(
  element: JSONElement,
  platform: 'android' | 'ios',
): boolean {
  const attrs = element.attributes;

  // Check for text content
  if (attrs.text && attrs.text.trim() !== '' && attrs.text !== 'null') {
    return true;
  }

  if (platform === 'android') {
    // Android: content-desc is accessibility info
    if (attrs['content-desc'] && attrs['content-desc'].trim() !== '' && attrs['content-desc'] !== 'null') {
      return true;
    }
  } else {
    // iOS: label or name is accessibility info
    if (attrs.label && attrs.label.trim() !== '' && attrs.label !== 'null') {
      return true;
    }
    if (attrs.name && attrs.name.trim() !== '' && attrs.name !== 'null') {
      return true;
    }
  }

  return false;
}

/**
 * Determine if an element should be included based on all filter criteria
 */
export function shouldIncludeElement(
  element: JSONElement,
  filters: FilterOptions,
  isNative: boolean,
  automationName: string,
): boolean {
  const {
    includeTagNames = [],
    excludeTagNames = ['hierarchy'], // Always exclude root hierarchy node
    requireAttributes = [],
    minAttributeCount = 0,
    fetchableOnly = false,
    clickableOnly = false,
    visibleOnly = true,
  } = filters;

  // Check tag name filters
  if (!matchesTagFilters(element, includeTagNames, excludeTagNames)) {
    return false;
  }

  // Check attribute filters
  if (!matchesAttributeFilters(element, requireAttributes, minAttributeCount)) {
    return false;
  }

  // Check clickable filter (Android only)
  if (clickableOnly && element.attributes?.clickable !== 'true') {
    return false;
  }

  // Check visible/displayed filter
  if (visibleOnly) {
    const isAndroid = automationName.toLowerCase().includes('uiautomator');
    if (isAndroid && element.attributes?.displayed === 'false') {
      return false;
    }
    if (!isAndroid && element.attributes?.visible === 'false') {
      return false;
    }
  }

  // Check fetchable/interactable filter
  if (fetchableOnly && !isInteractableElement(element, isNative, automationName)) {
    return false;
  }

  return true;
}

/**
 * Get default filter options for a platform
 */
export function getDefaultFilters(
  platform: 'android' | 'ios',
  includeContainers: boolean = false,
): FilterOptions {
  const layoutContainers = platform === 'android' ? ANDROID_LAYOUT_CONTAINERS : IOS_LAYOUT_CONTAINERS;

  return {
    excludeTagNames: includeContainers ? ['hierarchy'] : ['hierarchy', ...layoutContainers],
    fetchableOnly: !includeContainers,
    visibleOnly: true,
    clickableOnly: false,
  };
}
