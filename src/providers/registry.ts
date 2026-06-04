import type { SessionProvider } from './types';
import { localBrowserProvider } from './local-browser.provider';
import { localAppiumProvider } from './local-appium.provider';
import { browserStackProvider } from './cloud/browserstack.provider';
import { sauceLabsProvider } from './cloud/saucelabs.provider';

const providers = new Map<string, SessionProvider>([
  ['browserstack', browserStackProvider],
  ['saucelabs', sauceLabsProvider],
]);

function getDefaultProvider(platform: string): SessionProvider {
  return platform === 'browser' ? localBrowserProvider : localAppiumProvider;
}

export function getProvider(providerName: string, platform: string): SessionProvider {
  return providers.get(providerName) ?? getDefaultProvider(platform);
}
