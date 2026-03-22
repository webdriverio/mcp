import type { ResourceDefinition } from '../types/resource';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp';
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
  template: new ResourceTemplate('wdio://session/current/cookies{?name}', { list: undefined }),
  description: 'Cookies for the current session',
  handler: async (uri, variables) => {
    const result = await readCookies(variables.name as string | undefined);
    return { contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.text }] };
  },
};