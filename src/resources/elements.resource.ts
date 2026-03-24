import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';
import { getElements } from '../scripts/get-elements';
import { encode } from '@toon-format/toon';

export const elementsResource: ResourceDefinition = {
  name: 'session-current-elements',
  uri: 'wdio://session/current/elements',
  description: 'Interactable elements on the current page. Prefer this over screenshot — returns ready-to-use selectors, faster, and far fewer tokens. Only use screenshot for visual verification or debugging.',
  handler: async () => {
    try {
      const browser = getBrowser();
      const result = await getElements(browser, {});
      const text = encode(result).replace(/,""/g, ',').replace(/"",/g, ',');
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
