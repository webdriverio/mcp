import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';

function matchesHost(domain: string | undefined, host: string): boolean {
  if (!domain) return false;
  if (domain.startsWith('.')) return host === domain.slice(1) || host.endsWith(domain);
  return host === domain;
}

async function pickByPageHost<T extends { domain?: string }>(
  browser: { getUrl(): Promise<string> },
  cookies: T[],
): Promise<T> {
  let host: string;
  try {
    host = new URL(await browser.getUrl()).hostname;
  } catch {
    return cookies[0];
  }
  return cookies.find((c) => matchesHost(c.domain, host)) ?? cookies[0];
}

export async function readCookies(name?: string): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();

    // BiDi reads the page-origin storage partition, which Chrome fills only with Secure cookies; null reads the whole jar.
    if (name) {
      const cookies = await browser.getCookies({ name }, null);
      if (cookies.length === 0) {
        return { mimeType: 'application/json', text: JSON.stringify(null) };
      }
      const cookie = cookies.length > 1 ? await pickByPageHost(browser, cookies) : cookies[0];
      return { mimeType: 'application/json', text: JSON.stringify(cookie) };
    }
    const cookies = await browser.getCookies(undefined, null);
    return { mimeType: 'application/json', text: JSON.stringify(cookies) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
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