import type { SessionProvider } from './types';
import { localBrowserProvider } from './local-browser.provider';
import { localAppiumProvider } from './local-appium.provider';
import { browserStackProvider } from './cloud/browserstack.provider';

export function getProvider(providerName: string, platform: string): SessionProvider {
  if (providerName === 'browserstack') return browserStackProvider;
  return platform === 'browser' ? localBrowserProvider : localAppiumProvider;
}
