import { afterEach, describe, expect, it } from 'vitest';
import { cleanupUi5Runtime } from '../../src/ui5/runtime';

const globals = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete globals.browser;
  delete globals.__wdi5Config;
});

describe('cleanupUi5Runtime', () => {
  it('removes globals owned by the given browser', () => {
    const browser = { sessionId: 'a' };
    globals.browser = browser;
    globals.__wdi5Config = { baseUrl: 'https://x', wdi5: {} };

    cleanupUi5Runtime(browser as unknown as WebdriverIO.Browser);

    expect(globals.browser).toBeUndefined();
    expect(globals.__wdi5Config).toBeUndefined();
  });

  it('leaves globals owned by a replacement session in place', () => {
    const oldBrowser = { sessionId: 'a' };
    const newBrowser = { sessionId: 'b' };
    globals.browser = newBrowser;
    globals.__wdi5Config = { baseUrl: 'https://x', wdi5: {} };

    cleanupUi5Runtime(oldBrowser as unknown as WebdriverIO.Browser);

    expect(globals.browser).toBe(newBrowser);
    expect(globals.__wdi5Config).toEqual({ baseUrl: 'https://x', wdi5: {} });
  });

  it('removes nothing when no session owns the globals', () => {
    cleanupUi5Runtime({ sessionId: 'a' } as unknown as WebdriverIO.Browser);

    expect(globals.browser).toBeUndefined();
    expect(globals.__wdi5Config).toBeUndefined();
  });
});