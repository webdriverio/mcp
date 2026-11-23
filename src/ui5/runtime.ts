import { createRequire } from 'node:module';
import path from 'node:path';

interface Wdi5Bridge {
  start(config: Wdi5Config, browser: WebdriverIO.Browser): Promise<void>;
  setup(config: Wdi5Config, browser: WebdriverIO.Browser): Promise<void>;
  injectUI5(config: Wdi5Config, browser: WebdriverIO.Browser): Promise<boolean | void>;
  authenticate(options: Record<string, unknown>, browserInstanceName: string): Promise<void>;
  _addWdi5Commands(browser: WebdriverIO.Browser): Promise<void>;
}

interface Wdi5ClientSide {
  clientSide_getUI5Version(browser: WebdriverIO.Browser): Promise<string>;
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

let runtime: { bridge: Wdi5Bridge; serviceModule: { default: Wdi5ServiceCtor }; clientSide: Wdi5ClientSide } | null = null;

const configByBrowser = new WeakMap<WebdriverIO.Browser, Wdi5Config>();
const ui5VersionByBrowser = new WeakMap<WebdriverIO.Browser, string>();
let globalsQueue: Promise<unknown> = Promise.resolve();

const missingExport = (symbol: string): Error =>
  new Error(
    `wdio-ui5-service is missing expected export "${symbol}" — internal layout changed, pin review needed`,
  );

function loadUi5Runtime() {
  if (runtime) return runtime;

  let bridge: Wdi5Bridge;
  let serviceModule: { default: Wdi5ServiceCtor };
  let clientSide: Wdi5ClientSide;
  try {
    // Loaded by path because the package `exports` map blocks subpath imports and its
    // main entry transitively requires the wdio testrunner launcher — these dist files require neither.
    const distRoot = path.dirname(require_.resolve('wdio-ui5-service'));
    bridge = require_(path.join(distRoot, 'lib/wdi5-bridge.cjs')) as Wdi5Bridge;
    serviceModule = require_(path.join(distRoot, 'service.cjs')) as { default: Wdi5ServiceCtor };
    clientSide = require_(path.join(distRoot, 'client-side-js/getUI5Version.cjs')) as Wdi5ClientSide;
  } catch (e) {
    throw new Error(`ui5-service runtime unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const symbol of ['start', 'setup', 'injectUI5', 'authenticate', '_addWdi5Commands'] as const) {
    if (typeof bridge[symbol] !== 'function') throw missingExport(symbol);
  }
  if (typeof serviceModule.default?.prototype?.enableBTPWorkZoneStdEdition !== 'function') {
    throw missingExport('enableBTPWorkZoneStdEdition');
  }
  if (typeof clientSide.clientSide_getUI5Version !== 'function') throw missingExport('clientSide_getUI5Version');

  runtime = { bridge, serviceModule, clientSide };
  return runtime;
}

// wdi5's bridge and Authenticator read the ambient `browser` and `$` at call time, so overlapping
// sessions must not interleave their calls.
function withWdi5Globals<T>(browser: WebdriverIO.Browser, fn: () => Promise<T>): Promise<T> {
  const run = globalsQueue.then(async () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    const previous = { browser: globals.browser, $: globals.$ };
    globals.browser = browser;
    globals.$ = browser.$.bind(browser);
    try {
      return await fn();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete globals[key];
        } else {
          globals[key] = value;
        }
      }
    }
  });
  globalsQueue = run.catch(() => undefined);
  return run;
}

// Replaces wdi5's getUI5Version, whose cache is module-wide and would hand one session's version to another.
function registerUi5Version(browser: WebdriverIO.Browser, clientSide: Wdi5ClientSide): void {
  browser.addCommand('getUI5Version', async () => {
    const cached = ui5VersionByBrowser.get(browser);
    if (cached) return cached;
    const version = await clientSide.clientSide_getUI5Version(browser);
    ui5VersionByBrowser.set(browser, version);
    return version;
  });
}

export async function initUi5(browser: WebdriverIO.Browser, config: Wdi5Config): Promise<void> {
  const { bridge, clientSide } = loadUi5Runtime();
  configByBrowser.set(browser, config);
  await bridge.start(config, browser);
  await withWdi5Globals(browser, () => bridge.setup(config, browser));
  // setup() short-circuits on wdi5's module-level _setupComplete after the first session in
  // this process, so the per-browser command registration is repeated here for every session
  const perBrowser = browser as unknown as { _controls?: unknown };
  if (!perBrowser._controls) perBrowser._controls = {};
  await bridge._addWdi5Commands(browser);
  registerUi5Version(browser, clientSide);
}

export async function authenticateUi5(browser: WebdriverIO.Browser, options: Record<string, unknown>): Promise<void> {
  const { bridge } = loadUi5Runtime();
  const config = configByBrowser.get(browser);
  if (!config) throw new Error('authenticateUi5 called before initUi5');
  // setup() re-points wdi5's module-level _config, which BasicAuth reads for baseUrl
  await withWdi5Globals(browser, async () => {
    await bridge.setup(config, browser);
    await bridge.authenticate(options, '');
  });
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
  const config = configByBrowser.get(browser);
  if (!config) throw new Error('ui5: selector used outside a UI5 session');
  const injected = await browser.execute(() => Boolean((window as unknown as { wdi5?: unknown }).wdi5));
  if (!injected) await injectUi5(browser, config);
}

export function cleanupUi5Runtime(browser: WebdriverIO.Browser): void {
  configByBrowser.delete(browser);
  ui5VersionByBrowser.delete(browser);
}
