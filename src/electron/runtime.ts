/** Lazy boundary around the optional Electron runtime. Keeping this import dynamic
 * prevents Electron service code from running for browser and mobile sessions. */
import type * as ElectronService from '@wdio/electron-service';

export type ElectronServiceModule = typeof ElectronService;

export async function getElectronService(): Promise<ElectronServiceModule> {
  try {
    return await import('@wdio/electron-service');
  } catch (error) {
    throw new Error(`Electron runtime is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function cleanupSessionRuntime(
  runtime: 'webdriver' | 'electron' | undefined,
  browser: WebdriverIO.Browser,
): Promise<void> {
  if (runtime === 'electron') {
    const { cleanupWdioSession } = await getElectronService();
    await cleanupWdioSession(browser);
  }
}
