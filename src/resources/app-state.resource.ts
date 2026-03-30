import type { ResourceDefinition } from '../types/resource';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBrowser } from '../session/state';

async function readAppState(bundleId: string): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();

    const appIdentifier = browser.isAndroid
      ? { appId: bundleId }
      : { bundleId: bundleId };

    const state: string = await browser.execute('mobile: queryAppState', appIdentifier);

    const stateMap: Record<string, string> = {
      0: 'not installed',
      1: 'not running',
      2: 'running in background (suspended)',
      3: 'running in background',
      4: 'running in foreground',
    };

    return {
      mimeType: 'text/plain',
      text: `App state for ${bundleId}: ${stateMap[state] || 'unknown: ' + state}`,
    };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error getting app state: ${e}` };
  }
}

export const appStateResource: ResourceDefinition = {
  name: 'session-current-app-state',
  template: new ResourceTemplate('wdio://session/current/app-state/{bundleId}', { list: undefined }),
  description: 'App state for a given bundle ID',
  handler: async (uri, variables) => {
    const result = await readAppState(variables.bundleId as string);
    return { contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.text }] };
  },
};