import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';

async function readContexts(): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
    const contexts = await browser.getContexts();
    return { mimeType: 'application/json', text: JSON.stringify(contexts) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
  }
}

async function readCurrentContext(): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
    const currentContext = await browser.getContext();
    return { mimeType: 'application/json', text: JSON.stringify(currentContext) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
  }
}

export const contextsResource: ResourceDefinition = {
  name: 'session-current-contexts',
  uri: 'wdio://session/current/contexts',
  description: 'Available contexts (NATIVE_APP, WEBVIEW)',
  handler: async () => {
    const result = await readContexts();
    return { contents: [{ uri: 'wdio://session/current/contexts', mimeType: result.mimeType, text: result.text }] };
  },
};

export const contextResource: ResourceDefinition = {
  name: 'session-current-context',
  uri: 'wdio://session/current/context',
  description: 'Currently active context',
  handler: async () => {
    const result = await readCurrentContext();
    return { contents: [{ uri: 'wdio://session/current/context', mimeType: result.mimeType, text: result.text }] };
  },
};