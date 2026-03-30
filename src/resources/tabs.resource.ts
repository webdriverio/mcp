import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';

async function readTabs(): Promise<{ mimeType: string; text: string }> {
  try {
    const browser = getBrowser();
    const handles = await browser.getWindowHandles();
    const currentHandle = await browser.getWindowHandle();
    const tabs = [];
    for (const handle of handles) {
      await browser.switchToWindow(handle);
      tabs.push({
        handle,
        title: await browser.getTitle(),
        url: await browser.getUrl(),
        isActive: handle === currentHandle,
      });
    }
    await browser.switchToWindow(currentHandle);
    return { mimeType: 'application/json', text: JSON.stringify(tabs) };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error: ${e}` };
  }
}

export const tabsResource: ResourceDefinition = {
  name: 'session-current-tabs',
  uri: 'wdio://session/current/tabs',
  description: 'Browser tabs in the current session',
  handler: async () => {
    const result = await readTabs();
    return { contents: [{ uri: 'wdio://session/current/tabs', mimeType: result.mimeType, text: result.text }] };
  },
};