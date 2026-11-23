import type { ResourceDefinition } from '../types/resource';
import { getBrowser, isUi5Session } from '../session/state';
import { getSnapshot } from '@wdio/elements';
import { truncateSnapshot } from '../utils/snapshot-text';
import { getUi5ControlsText } from '../ui5/controls-text';

const ELEMENTS_URI = 'wdio://session/current/elements';

export const elementsResource: ResourceDefinition = {
  name: 'session-current-elements',
  uri: ELEMENTS_URI,
  description: 'Accessibility tree of the current page or screen (viewport only) with an eN ref and a ready-to-use selector on each actionable line. Prefer this over screenshot — faster, and far fewer tokens. Only use screenshot for visual verification or debugging.',
  handler: async () => {
    try {
      const browser = getBrowser();
      if (isUi5Session()) {
        const text = await getUi5ControlsText(browser, { inViewportOnly: true });
        return { contents: [{ uri: ELEMENTS_URI, mimeType: 'text/plain', text }] };
      }
      const { text } = await getSnapshot(browser, { inViewportOnly: true });
      return { contents: [{ uri: ELEMENTS_URI, mimeType: 'text/plain', text: truncateSnapshot(text) }] };
    } catch (e) {
      return {
        contents: [{
          uri: ELEMENTS_URI,
          mimeType: 'text/plain',
          text: `Error getting elements: ${e}`
        }]
      };
    }
  },
};
