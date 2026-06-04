import type { SessionProvider } from './types';
import { localBrowserProvider } from './local-browser.provider';
import { localAppiumProvider } from './local-appium.provider';
import { browserStackProvider } from './cloud/browserstack.provider';
import { sauceLabsProvider } from './cloud/saucelabs.provider';

export function getProvider(providerName: string, platform: string): SessionProvider {
  if (providerName === 'browserstack') return browserStackProvider;
  if (providerName === 'saucelabs') return sauceLabsProvider;
  return platform === 'browser' ? localBrowserProvider : localAppiumProvider;
}
