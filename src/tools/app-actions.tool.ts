import { getBrowser } from '../session/state';

export async function readAppState(bundleId: string): Promise<{ mimeType: string; text: string }> {
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
