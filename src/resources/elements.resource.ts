import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';
import { getElements } from '@wdio/elements';
import { encode } from '@toon-format/toon';

export const elementsResource: ResourceDefinition = {
  name: 'session-current-elements',
  uri: 'wdio://session/current/elements',
  description: 'Flat list of interactable elements on the current page with ready-to-use selectors — faster and far fewer tokens than a screenshot. For page structure and clickable refs prefer the get_snapshot tool. Only use screenshot for visual verification or debugging.',
  handler: async () => {
    try {
      const browser = getBrowser();
      const result = await getElements(browser, {});
      const text = encode(result);
      return { contents: [{ uri: 'wdio://session/current/elements', mimeType: 'text/plain', text }] };
    } catch (e) {
      return {
        contents: [{
          uri: 'wdio://session/current/elements',
          mimeType: 'text/plain',
          text: `Error getting visible elements: ${e}`
        }]
      };
    }
  },
};
