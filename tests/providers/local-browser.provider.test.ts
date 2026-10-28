import { describe, it, expect, vi } from 'vitest';
import { localBrowserProvider, matchHeadedUserAgent } from '../../src/providers/local-browser.provider';

describe('LocalBrowserProvider', () => {
  it('fails BiDi commands after 30s instead of the 180s default', () => {
    expect(localBrowserProvider.getConnectionConfig({})).toEqual({
      bidiResponseTimeout: 30_000,
      connectionRetryTimeout: 45_000,
      connectionRetryCount: 0,
    });
  });

  it.each(['chrome', 'edge'] as const)('buildCapabilities: %s hides navigator.webdriver', (browser) => {
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

  it.each([
    ['chrome', 'goog:loggingPrefs'],
    ['edge', 'ms:loggingPrefs'],
  ] as const)('buildCapabilities: %s sets no loggingPrefs when networkLogs is none or omitted', (browser, prefKey) => {
    expect(localBrowserProvider.buildCapabilities({ browser })[prefKey]).toBeUndefined();
    expect(localBrowserProvider.buildCapabilities({ browser, networkLogs: 'none' })[prefKey]).toBeUndefined();
  });

  it.each([
    ['chrome', 'goog:loggingPrefs', 'failures'],
    ['chrome', 'goog:loggingPrefs', 'all'],
    ['edge', 'ms:loggingPrefs', 'failures'],
    ['edge', 'ms:loggingPrefs', 'all'],
  ] as const)('buildCapabilities: %s enables only performance loggingPrefs when networkLogs is %s', (browser, prefKey, networkLogs) => {
    const caps = localBrowserProvider.buildCapabilities({ browser, networkLogs });
    expect(caps[prefKey]).toEqual({ performance: 'ALL' });
  });

  it('buildCapabilities: chrome driver spawns detached so its process group can be killed', () => {
    const caps = localBrowserProvider.buildCapabilities({ browser: 'chrome' });
    expect(caps['wdio:chromedriverOptions']).toEqual({ spawnOpts: { detached: true } });
  });

  it('buildCapabilities: user chromedriver options are preserved alongside detached spawn', () => {
    const caps = localBrowserProvider.buildCapabilities({
      browser: 'chrome',
      capabilities: { 'wdio:chromedriverOptions': { port: 9515, spawnOpts: { cwd: '/tmp/driver' } } },
    });
    expect(caps['wdio:chromedriverOptions']).toEqual({ port: 9515, spawnOpts: { detached: true, cwd: '/tmp/driver' } });
  });

  it.each(['firefox', 'edge', 'safari'] as const)('buildCapabilities: %s adds no chromedriver options', (browser) => {
    const caps = localBrowserProvider.buildCapabilities({ browser });
    expect(caps['wdio:chromedriverOptions']).toBeUndefined();
  });

  it('buildCapabilities: chrome on win32 adds no chromedriver options', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const caps = localBrowserProvider.buildCapabilities({ browser: 'chrome' });
      expect(caps['wdio:chromedriverOptions']).toBeUndefined();
    } finally {
      Object.defineProperty(process, 'platform', original);
    }
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
