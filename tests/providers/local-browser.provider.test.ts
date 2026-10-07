import { describe, it, expect, vi } from 'vitest';
import { localBrowserProvider, matchHeadedUserAgent } from '../../src/providers/local-browser.provider';

describe('LocalBrowserProvider', () => {
  it('fails BiDi commands after 30s instead of the 180s default', () => {
    expect(localBrowserProvider.getConnectionConfig({})).toEqual({ bidiResponseTimeout: 30_000 });
  });

  it.each(['chrome', 'edge'])('buildCapabilities: %s hides navigator.webdriver', (browser) => {
    const caps = localBrowserProvider.buildCapabilities({ browser });
    const key = browser === 'chrome' ? 'goog:chromeOptions' : 'ms:edgeOptions';
    expect((caps[key] as any).args).toContain('--disable-blink-features=AutomationControlled');
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

  describe('matchHeadedUserAgent', () => {
    const browserWith = (ua: unknown, isBidi = true) => ({
      isBidi,
      execute: vi.fn().mockResolvedValue(ua),
      emulationSetUserAgentOverride: vi.fn(),
    }) as unknown as WebdriverIO.Browser & { emulationSetUserAgentOverride: ReturnType<typeof vi.fn> };

    it('replaces the headless token', async () => {
      const browser = browserWith('Mozilla/5.0 HeadlessChrome/150.0.1.2 Safari/537.36');
      await matchHeadedUserAgent(browser);
      expect(browser.emulationSetUserAgentOverride).toHaveBeenCalledWith({ userAgent: 'Mozilla/5.0 Chrome/150.0.1.2 Safari/537.36' });
    });

    it('leaves a headed user agent and classic sessions alone', async () => {
      const headed = browserWith('Mozilla/5.0 Chrome/150.0.1.2 Safari/537.36');
      await matchHeadedUserAgent(headed);
      const classic = browserWith('HeadlessChrome/1', false);
      await matchHeadedUserAgent(classic);
      expect(headed.emulationSetUserAgentOverride).not.toHaveBeenCalled();
      expect(classic.emulationSetUserAgentOverride).not.toHaveBeenCalled();
    });
  });
});
