import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';

async function readGeolocation(): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
    const location = await browser.getGeoLocation();
    return { mimeType: 'application/json', text: JSON.stringify(location) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
  }
}

export const geolocationResource: ResourceDefinition = {
  name: 'session-current-geolocation',
  uri: 'wdio://session/current/geolocation',
  description: 'Current device geolocation',
  handler: async () => {
    const result = await readGeolocation();
    return { contents: [{ uri: 'wdio://session/current/geolocation', mimeType: result.mimeType, text: result.text }] };
  },
};