/**
 * UI5 control detection
 * Single browser.execute() call: sap.ui.core.Element registry → flat control list
 *
 * NOTE: This script runs in browser context via browser.execute()
 * It must be self-contained with no external dependencies
 */

export interface Ui5ControlInfo {
  tagName: string;       // UI5 control type, e.g. 'sap.m.Button'
  name: string;
  type: string;
  value: string;
  href: string;
  selector: string;      // 'ui5:' + RecordReplay selector object
  isInViewport: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface GetUi5ControlsOptions {
  includeBounds?: boolean;
  // Accepted for interface parity with the browser/mobile scripts — the registry already returns
  // containers, and controlType makes them distinguishable.
  includeContainers?: boolean;
}

interface Ui5ElementLike {
  getId(): string;
  getDomRef?: () => HTMLElement | null;
  getMetadata(): { getName(): string };
  getValue?: () => unknown;
}

interface Ui5RegistryLike {
  all(): Ui5ElementLike[];
}

interface Ui5Globals {
  sap?: {
    ui?: {
      core?: {
        Element?: { registry?: Ui5RegistryLike };
        ElementRegistry?: Ui5RegistryLike;
      };
    };
  };
  wdi5?: unknown;
  bridge?: {
    waitForUI5(): Promise<void>;
    findControlSelectorByDOMElement(options: { domElement: HTMLElement }): Promise<Record<string, unknown> | undefined>;
  };
}

const ui5ControlsScript = (includeBounds: boolean) => (async function () {
  const w = window as unknown as Ui5Globals;
  const core = w.sap && w.sap.ui && w.sap.ui.core;
  const registry = (core && core.Element && core.Element.registry) || (core && core.ElementRegistry);
  if (!registry) {
    throw new Error('No UI5 runtime found (sap.ui.core.Element.registry unavailable) — is this a UI5 app?');
  }

  if (!w.wdi5 || !w.bridge) {
    throw new Error('wdi5 bridge not injected — start the session without wdi5.skipInjectUI5OnStart');
  }
  await w.bridge.waitForUI5();

  const controls: Record<string, unknown>[] = [];

  // registry.all() returns an id-keyed map (not an array) across UI5 versions
  // ponytail: full-registry RecordReplay walk, ~100ms/visible control (22s on a ~850-control app);
  // cap or batch per frame if large apps become a problem
  for (const el of Object.values(registry.all())) {
    const dom = typeof el.getDomRef === 'function' ? el.getDomRef() : null;
    if (!dom || !dom.isConnected) continue;

    const rect = dom.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    let selectorObj: Record<string, unknown> | undefined;
    try {
      selectorObj = await w.bridge.findControlSelectorByDOMElement({ domElement: dom });
    } catch {
      // A control without a stable RecordReplay selector is data, not an error — the rest must
      // still be discovered.
      selectorObj = undefined;
    }
    if (!selectorObj) continue;

    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );

    const entry: Record<string, unknown> = {
      tagName: el.getMetadata().getName(),
      name: (dom.textContent || '').trim().slice(0, 100) || el.getId(),
      type: '',
      value: typeof el.getValue === 'function' ? String(el.getValue() ?? '') : '',
      href: '',
      selector: 'ui5:' + JSON.stringify(selectorObj),
      isInViewport,
    };

    if (includeBounds) {
      entry.boundingBox = {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    }

    controls.push(entry);
  }

  return controls;
})();

/**
 * Get rendered UI5 controls via the sap.ui.core element registry.
 */
export async function getUi5Controls(
  browser: WebdriverIO.Browser,
  params: GetUi5ControlsOptions = {},
): Promise<Ui5ControlInfo[]> {
  const { includeBounds = false } = params;
  return (browser as any).execute(ui5ControlsScript, includeBounds) as unknown as Promise<Ui5ControlInfo[]>;
}

export default ui5ControlsScript;
