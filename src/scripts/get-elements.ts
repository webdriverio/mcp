import { getInteractableBrowserElements } from './get-interactable-browser-elements';
import { getMobileVisibleElements } from './get-visible-mobile-elements';

export type VisibleElementsResult = {
  total: number;
  showing: number;
  hasMore: boolean;
  elements: unknown[];
};

export async function getElements(
  browser: WebdriverIO.Browser,
  params: {
    inViewportOnly?: boolean;
    includeContainers?: boolean;
    includeBounds?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<VisibleElementsResult> {
  const {
    inViewportOnly = true,
    includeContainers = false,
    includeBounds = false,
    limit = 0,
    offset = 0,
  } = params;

  let elements: { isInViewport?: boolean }[];

  if (browser.isAndroid || browser.isIOS) {
    const platform = browser.isAndroid ? 'android' : 'ios';
    elements = await getMobileVisibleElements(browser, platform, { includeContainers, includeBounds });
  } else {
    elements = await getInteractableBrowserElements(browser, { includeBounds });
  }

  if (inViewportOnly) {
    elements = elements.filter((el) => el.isInViewport !== false);
  }

  const total = elements.length;

  if (offset > 0) {
    elements = elements.slice(offset);
  }
  if (limit > 0) {
    elements = elements.slice(0, limit);
  }

  return {
    total,
    showing: elements.length,
    hasMore: offset + elements.length < total,
    elements,
  };
}
