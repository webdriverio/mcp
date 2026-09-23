import { createRequire } from 'node:module';
import path from 'node:path';

interface Wdi5Bridge {
  start(config: Wdi5Config, browser: WebdriverIO.Browser): Promise<void>;
  setup(config: Wdi5Config, browser: WebdriverIO.Browser): Promise<void>;
  injectUI5(config: Wdi5Config, browser: WebdriverIO.Browser): Promise<boolean | void>;
  authenticate(options: Record<string, unknown>, browserInstanceName: string): Promise<void>;
  _addWdi5Commands(browser: WebdriverIO.Browser): Promise<void>;
}

interface Wdi5ServiceLike {
  enableBTPWorkZoneStdEdition(browser: WebdriverIO.Browser): Promise<void>;
}

interface Wdi5ServiceCtor {
  new (_options: object, _capabilities: object, config: Wdi5Config): Wdi5ServiceLike;
}

export interface Wdi5Config {
  baseUrl: string;
  wdi5: Record<string, unknown>;
}

const require_ = createRequire(import.meta.url);

let runtime: { bridge: Wdi5Bridge; serviceModule: { default: Wdi5ServiceCtor } } | null = null;

const missingExport = (symbol: string): Error =>
  new Error(
    `wdio-ui5-service@3.0.12 is missing expected export "${symbol}" — internal layout changed, pin review needed`,
  );

function loadUi5Runtime() {
  if (runtime) return runtime;

  let bridge: Wdi5Bridge;
  let serviceModule: { default: Wdi5ServiceCtor };
  try {
    // Loaded by path because the package `exports` map blocks subpath imports and its
    // main entry transitively requires the wdio testrunner launcher — these dist files require neither.
    const distRoot = path.dirname(require_.resolve('wdio-ui5-service'));
    bridge = require_(path.join(distRoot, 'lib/wdi5-bridge.cjs')) as Wdi5Bridge;
    serviceModule = require_(path.join(distRoot, 'service.cjs')) as { default: Wdi5ServiceCtor };
  } catch (e) {
    throw new Error(`ui5-service runtime unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const symbol of ['start', 'setup', 'injectUI5', 'authenticate', '_addWdi5Commands'] as const) {
    if (typeof bridge[symbol] !== 'function') throw missingExport(symbol);
  }
  if (typeof serviceModule.default?.prototype?.enableBTPWorkZoneStdEdition !== 'function') {
    throw missingExport('enableBTPWorkZoneStdEdition');
  }

  runtime = { bridge, serviceModule };
  return runtime;
}

export async function initUi5(browser: WebdriverIO.Browser, config: Wdi5Config): Promise<void> {
  const globals = globalThis as unknown as Record<string, unknown>;
  // wdi5's bridge resolves the browser and config off ambient globals, not its arguments.
  globals.browser = browser;
  globals.__wdi5Config = config;

  const { bridge } = loadUi5Runtime();
  await bridge.start(config, browser);
  await bridge.setup(config, browser);
  // setup() short-circuits on wdi5's module-level _setupComplete after the first session in
  // this process, so the per-browser command registration is repeated here for every session
  const perBrowser = browser as unknown as { _controls?: unknown };
  if (!perBrowser._controls) perBrowser._controls = {};
  await bridge._addWdi5Commands(browser);
}

export async function authenticateUi5(options: Record<string, unknown>): Promise<void> {
  const { bridge } = loadUi5Runtime();
  await bridge.authenticate(options, '');
}

export async function injectUi5(browser: WebdriverIO.Browser, config: Wdi5Config): Promise<void> {
  const { bridge } = loadUi5Runtime();
  await bridge.injectUI5(config, browser);
}

export async function enableWorkZone(browser: WebdriverIO.Browser, config: Wdi5Config): Promise<void> {
  const { serviceModule } = loadUi5Runtime();
  await new serviceModule.default({}, {}, config).enableBTPWorkZoneStdEdition(browser);
}

/** Redirects (OAuth et al.) drop the injected wdi5 context, so re-inject before discovery and actions. */
export async function ensureUi5Injected(browser: WebdriverIO.Browser): Promise<void> {
  const config = (globalThis as unknown as { __wdi5Config?: Wdi5Config }).__wdi5Config;
  if (!config) throw new Error('ui5: selector used outside a UI5 session');
  const injected = await browser.execute(() => Boolean((window as unknown as { wdi5?: unknown }).wdi5));
  if (!injected) await injectUi5(browser, config);
}

export function cleanupUi5Runtime(): void {
  delete (globalThis as unknown as Record<string, unknown>).browser;
  delete (globalThis as unknown as Record<string, unknown>).__wdi5Config;
}
