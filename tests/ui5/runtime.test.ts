import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateUi5, cleanupUi5Runtime, ensureUi5Injected, initUi5 } from '../../src/ui5/runtime';

interface FakeBrowser {
  sessionId: string;
  ui5Version: string;
  $: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  commands: Record<string, () => Promise<string>>;
  addCommand: (name: string, fn: () => Promise<string>) => void;
}

interface BridgeExports {
  start(config: unknown, browser: unknown): Promise<void>;
  setup(config: unknown, browser: unknown): Promise<void>;
  injectUI5(config: unknown, browser: unknown): Promise<boolean>;
  authenticate(options: Record<string, unknown>, browserInstanceName: string): Promise<void>;
  _addWdi5Commands(browser: unknown): Promise<void>;
}

interface ClientSideExports {
  clientSide_getUI5Version(browser: unknown): Promise<string>;
}

const require_ = createRequire(import.meta.url);
const distRoot = path.dirname(require_.resolve('wdio-ui5-service'));
const bridge = require_(path.join(distRoot, 'lib/wdi5-bridge.cjs')) as BridgeExports;
const clientSide = require_(path.join(distRoot, 'client-side-js/getUI5Version.cjs')) as ClientSideExports;

const globals = globalThis as unknown as Record<string, unknown>;
const configA = { baseUrl: 'https://a', wdi5: {} };
const configB = { baseUrl: 'https://b', wdi5: {} };

function makeBrowser(sessionId: string, ui5Version: string): FakeBrowser {
  const commands: Record<string, () => Promise<string>> = {};
  return {
    sessionId,
    ui5Version,
    $: vi.fn(),
    execute: vi.fn(async () => false),
    commands,
    addCommand: (name, fn) => {
      commands[name] = fn;
    },
  };
}

const asBrowser = (browser: FakeBrowser) => browser as unknown as WebdriverIO.Browser;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(bridge, 'start').mockResolvedValue(undefined);
  vi.spyOn(bridge, 'setup').mockResolvedValue(undefined);
  vi.spyOn(bridge, 'injectUI5').mockResolvedValue(true);
  vi.spyOn(bridge, 'authenticate').mockResolvedValue(undefined);
  // Mirrors wdi5, which caches the version in a module-level variable shared by every browser.
  vi.spyOn(bridge, '_addWdi5Commands').mockImplementation(async (browser) => {
    (browser as FakeBrowser).addCommand('getUI5Version', async () => 'module-cached');
  });
  vi.spyOn(clientSide, 'clientSide_getUI5Version').mockImplementation(async (browser) => (browser as FakeBrowser).ui5Version);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globals.browser;
  delete globals.$;
});

describe('ui5 runtime per browser', () => {
  it('injects each browser with its own config', async () => {
    const a = makeBrowser('a', '1.120.0');
    const b = makeBrowser('b', '1.71.0');
    await initUi5(asBrowser(a), configA);
    await initUi5(asBrowser(b), configB);

    await ensureUi5Injected(asBrowser(a));
    expect(bridge.injectUI5).toHaveBeenLastCalledWith(configA, a);

    await ensureUi5Injected(asBrowser(b));
    expect(bridge.injectUI5).toHaveBeenLastCalledWith(configB, b);
  });

  it('keeps the other session working after one session closes', async () => {
    const a = makeBrowser('a', '1.120.0');
    const b = makeBrowser('b', '1.71.0');
    await initUi5(asBrowser(a), configA);
    await initUi5(asBrowser(b), configB);

    cleanupUi5Runtime(asBrowser(a));

    await ensureUi5Injected(asBrowser(b));
    expect(bridge.injectUI5).toHaveBeenCalledWith(configB, b);
    await expect(ensureUi5Injected(asBrowser(a))).rejects.toThrow('outside a UI5 session');
  });

  it('sets wdi5 globals to the browser only while setup and authenticate run', async () => {
    const a = makeBrowser('a', '1.120.0');
    let duringSetup: unknown;
    vi.mocked(bridge.setup).mockImplementationOnce(async () => {
      duringSetup = globals.browser;
    });
    await initUi5(asBrowser(a), configA);
    expect(duringSetup).toBe(a);
    expect(globals.browser).toBeUndefined();
    expect(globals.$).toBeUndefined();

    let duringAuth: unknown;
    vi.mocked(bridge.authenticate).mockImplementationOnce(async () => {
      duringAuth = globals.browser;
      (globals.$ as (selector: string) => unknown)('#login');
    });
    await authenticateUi5(asBrowser(a), { provider: 'BasicAuth' });
    expect(duringAuth).toBe(a);
    expect(a.$).toHaveBeenCalledWith('#login');
    expect(globals.browser).toBeUndefined();
    expect(globals.$).toBeUndefined();
  });

  it('serializes authenticateUi5 across browsers', async () => {
    const a = makeBrowser('a', '1.120.0');
    const b = makeBrowser('b', '1.71.0');
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gateA = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    vi.mocked(bridge.authenticate).mockImplementationOnce(async () => {
      order.push('start a');
      await gateA;
      order.push('end a');
    });
    vi.mocked(bridge.authenticate).mockImplementationOnce(async () => {
      order.push('start b');
      order.push('end b');
    });
    await initUi5(asBrowser(a), configA);
    await initUi5(asBrowser(b), configB);
    vi.mocked(bridge.setup).mockClear();

    const pA = authenticateUi5(asBrowser(a), { provider: 'BasicAuth' });
    const pB = authenticateUi5(asBrowser(b), { provider: 'BasicAuth' });
    await flush();
    expect(order).toEqual(['start a']);

    release();
    await Promise.all([pA, pB]);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
    expect(vi.mocked(bridge.setup).mock.calls).toEqual([[configA, a], [configB, b]]);
  });

  it('rejects authenticateUi5 before initUi5', async () => {
    await expect(authenticateUi5(asBrowser(makeBrowser('z', '1')), {})).rejects.toThrow('before initUi5');
  });

  it('resolves getUI5Version from each browser own page', async () => {
    const a = makeBrowser('a', '1.120.0');
    const b = makeBrowser('b', '1.71.0');
    await initUi5(asBrowser(a), configA);
    await initUi5(asBrowser(b), configB);

    expect(await a.commands.getUI5Version()).toBe('1.120.0');
    expect(await b.commands.getUI5Version()).toBe('1.71.0');
    expect(clientSide.clientSide_getUI5Version).toHaveBeenCalledWith(a);
  });
});

describe('cleanupUi5Runtime', () => {
  it('drops the closed browser wdi5 state', async () => {
    const a = makeBrowser('a', '1.120.0');
    await initUi5(asBrowser(a), configA);

    cleanupUi5Runtime(asBrowser(a));

    await expect(ensureUi5Injected(asBrowser(a))).rejects.toThrow('outside a UI5 session');
  });

  it('is a no-op for a browser that never initialized', () => {
    expect(() => cleanupUi5Runtime(asBrowser(makeBrowser('x', '1')))).not.toThrow();
  });
});
