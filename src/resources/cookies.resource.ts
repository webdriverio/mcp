import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';

async function readCookies(name?: string): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();

    if (name) {
      const cookie = await browser.getCookies([name]);
      if (cookie.length === 0) {
        return { mimeType: 'application/json', text: JSON.stringify(null) };
      }
      return { mimeType: 'application/json', text: JSON.stringify(cookie[0]) };
    }
    const cookies = await browser.getCookies();
    return { mimeType: 'application/json', text: JSON.stringify(cookies) };
  } catch (e) {
    return { mimeType: 'application/json', text: JSON.stringify({ error: String(e) }) };
  }
}

export const cookiesResource: ResourceDefinition = {
  name: 'session-current-cookies',
  uri: 'wdio://session/current/cookies',
  description: 'Cookies for the current session',
  handler: async () => {
    const result = await readCookies();
    return { contents: [{ uri: 'wdio://session/current/cookies', mimeType: result.mimeType, text: result.text }] };
  },
};