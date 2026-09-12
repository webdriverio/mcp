import type { ResourceDefinition } from '../types/resource';
import { getBrowser, getState } from '../session/state';
import { getSnapshot } from '@wdio/elements';
import { storeRefs } from '../session/element-refs';

const uri = 'wdio://session/current/snapshot';

export const snapshotResource: ResourceDefinition = {
  name: 'session-current-snapshot',
  uri,
  description:
    'Depth-indented text snapshot of the current page with interactive elements and selectors. ' +
    'Similar to an accessibility tree but optimized for LLM consumption — each interactive element ' +
    'includes a ready-to-use WebdriverIO selector and an `eN` reference accepted by click_element, ' +
    'set_value, tap_element and drag_and_drop. Prefer this over the elements resource for ' +
    'spatial/hierarchical understanding of the page.',
  handler: async () => {
    try {
      const browser = getBrowser();
      const { text, elements } = await getSnapshot(browser, { inViewportOnly: true });

      const sessionId = getState().currentSession;
      if (sessionId) storeRefs(sessionId, elements);

      return { contents: [{ uri, mimeType: 'text/plain', text }] };
    } catch (e) {
      return { contents: [{ uri, mimeType: 'text/plain', text: `Error getting snapshot: ${e}` }] };
    }
  },
};
