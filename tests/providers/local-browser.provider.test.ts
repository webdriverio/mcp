import { describe, it, expect } from 'vitest';
import { localBrowserProvider } from '../../src/providers/local-browser.provider';

describe('LocalBrowserProvider', () => {
  it('returns empty connection config (local defaults)', () => {
    expect(localBrowserProvider.getConnectionConfig({})).toEqual({});
  });

  it('buildCapabilities: chrome headless includes --headless=new arg', () => {
    const caps = localBrowserProvider.buildCapabilities({ browser: 'chrome', headless: true });
    const args = (caps['goog:chromeOptions'] as any)?.args ?? [];
    expect(args).toContain('--headless=new');
  });

  it('buildCapabilities: safari headless ignored (headless not supported)', () => {
    const caps = localBrowserProvider.buildCapabilities({ browser: 'safari', headless: true });
    expect(caps.browserName).toBe('safari');
    expect(caps['goog:chromeOptions']).toBeUndefined();
  });

  it('buildCapabilities: merges user capabilities', () => {
    const caps = localBrowserProvider.buildCapabilities({
      browser: 'chrome',
      headless: false,
      capabilities: { 'goog:chromeOptions': { args: ['--custom-flag'] } },
    });
    const args = (caps['goog:chromeOptions'] as any)?.args ?? [];
    expect(args).toContain('--custom-flag');
  });

  it('getSessionType returns browser', () => {
    expect(localBrowserProvider.getSessionType({})).toBe('browser');
  });

  it('shouldAutoDetach returns false', () => {
    expect(localBrowserProvider.shouldAutoDetach({})).toBe(false);
  });
});
