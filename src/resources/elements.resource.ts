import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';
import { getInteractableBrowserElements } from '../scripts/get-interactable-browser-elements';
import { getMobileVisibleElements } from '../scripts/get-visible-mobile-elements';
import { encode } from '@toon-format/toon';

async function readVisibleElements(params: {
  inViewportOnly?: boolean;
  includeContainers?: boolean;
  includeBounds?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
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

    const result: Record<string, unknown> = {
      total,
      showing: elements.length,
      hasMore: offset + elements.length < total,
      elements,
    };

    const toon = encode(result).replace(/,""/g, ',').replace(/"",/g, ',');
    return { mimeType: 'text/plain', text: toon };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error getting visible elements: ${e}` };
  }
}

export const elementsResource: ResourceDefinition = {
  name: 'session-current-elements',
  uri: 'wdio://session/current/elements',
  description: 'Interactable elements on the current page',
  handler: async () => {
    const result = await readVisibleElements({});
    return { contents: [{ uri: 'wdio://session/current/elements', mimeType: result.mimeType, text: result.text }] };
  },
};