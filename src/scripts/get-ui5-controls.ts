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
  includeContainers?: boolean;
  inViewportOnly?: boolean;
}

interface Ui5ElementLike {
  getId(): string;
  getDomRef?: () => HTMLElement | null;
  getMetadata(): { getName(): string };
}

interface Ui5RegistryLike {
  all(): Record<string, Ui5ElementLike>;
}

interface Ui5Globals {
  sap?: {
    ui?: {
      core?: {
        Element?: { registry?: Ui5RegistryLike };
        ElementRegistry?: Ui5RegistryLike;
      };
    };
    m?: { SegmentedButtonItem?: new (...args: unknown[]) => unknown };
  };
  wdi5?: unknown;
  bridge?: {
    waitForUI5(): Promise<void>;
    findControlSelectorByDOMElement(options: { domElement: HTMLElement }): Promise<Record<string, unknown> | undefined>;
  };
}

const ui5ControlsScript = (includeBounds: boolean, includeContainers: boolean, inViewportOnly: boolean) => (async function () {
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

  // Same filtering strategy as the browser/mobile scripts: an interactable allowlist, matched
  // partially so custom namespaces (com.my.CustomButton) hit the same rungs as sap.m.*.
  // Checked before findControlSelectorByDOMElement — that call dominates the walk (~100ms/control).
  const interactableTypes = [
    'Button', 'Link', 'CheckBox', 'RadioButton', 'Switch',
    'Input', 'SearchField', 'TextArea', 'ComboBox', 'Select', 'DatePicker', 'TimePicker',
    'DateTimePicker', 'Slider', 'RatingIndicator', 'StepInput',
    'ListItem', 'TreeItem', 'Tile', 'MenuItem', 'Icon', 'Breadcrumb',
    'NotificationListItem', 'Tokenizer', 'Token',
  ];
  const matchesAny = (controlType: string, types: readonly string[]) =>
    types.some((type) => controlType.includes(type));

  // Wrappers render through other controls: containers whose own type substring-matches an
  // interactable token, and SegmentedButtonItem, whose inner sap.m.Button over the same DOM
  // node is the real click target — and the id the emitted selector carries. Matched by
  // prototype so custom subclasses are covered, not by qualified name.
  const wrapperTypes = ['sap.m.SegmentedButton', 'sap.m.TileContainer'];
  const isWrapperControl = (el: Ui5ElementLike, controlType: string) => {
    const segmentedItem = w.sap && w.sap.m && w.sap.m.SegmentedButtonItem;
    if (segmentedItem && el instanceof segmentedItem) return true;
    return matchesAny(controlType, wrapperTypes);
  };

  // Guarded single-getter read: a throwing getter is data about one control, not a reason to
  // fail the whole listing — same stance as the selector lookup below.
  const readGetter = (el: Ui5ElementLike, getter: string): unknown => {
    const read = (el as unknown as Record<string, unknown>)[getter];
    if (typeof read !== 'function') return undefined;
    try {
      return (read as () => unknown).call(el);
    } catch {
      return undefined;
    }
  };

  // Prefer a control's own label over its rendered text: textContent concatenates siblings
  // ("Accessories34" = label + item count, "1,459.00 EUREmphasized" = price + state suffix).
  const readControlLabel = (el: Ui5ElementLike, dom: HTMLElement): string => {
    for (const getter of ['getText', 'getTitle', 'getPlaceholder']) {
      const value = readGetter(el, getter);
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return (dom.textContent || '').trim() || el.getId();
  };

  // sap.m.CheckBox/RadioButton expose getSelected, sap.m.Switch getState — without these a
  // checked and an unchecked box are byte-identical rows.
  const readControlValue = (el: Ui5ElementLike): string => {
    for (const getter of ['getValue', 'getSelected', 'getState']) {
      const value = readGetter(el, getter);
      if (value !== undefined && value !== null && value !== '') return String(value);
    }
    return '';
  };

  const controls: Record<string, unknown>[] = [];
  // One DOM node = one click target = one row; a non-wrapper control outranks a wrapper
  const nodeClaims = new Map<Element, { index: number; isWrapper: boolean }>();

  // registry.all() returns an id-keyed map (not an array) across UI5 versions
  // ponytail: full-registry RecordReplay walk, ~100ms/visible control (22s on a ~850-control app);
  // cap or batch per frame if large apps become a problem even with the interactable filter
  for (const el of Object.values(registry.all())) {
    const controlType = el.getMetadata().getName();
    const isWrapper = isWrapperControl(el, controlType);
    if (!includeContainers && (!matchesAny(controlType, interactableTypes) || isWrapper)) continue;

    const dom = typeof el.getDomRef === 'function' ? el.getDomRef() : null;
    if (!dom || !dom.isConnected) continue;

    // The node is claimed only after its selector resolves, so a control without a stable
    // selector does not block a sibling sharing its node
    const claim = nodeClaims.get(dom);
    const replacesWrapper = !!claim && claim.isWrapper && !isWrapper;
    if (claim && !replacesWrapper) continue;

    const rect = dom.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
    if (inViewportOnly && !isInViewport) continue;

    let selectorObj: Record<string, unknown> | undefined;
    try {
      selectorObj = await w.bridge.findControlSelectorByDOMElement({ domElement: dom });
    } catch {
      // A control without a stable RecordReplay selector is data, not an error — the rest must
      // still be discovered.
      selectorObj = undefined;
    }
    if (!selectorObj) continue;

    const href = readGetter(el, 'getHref');
    const entry: Record<string, unknown> = {
      tagName: controlType,
      name: readControlLabel(el, dom).slice(0, 100),
      type: '',
      value: readControlValue(el),
      href: href === undefined || href === null ? '' : String(href),
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

    if (claim) {
      controls[claim.index] = entry;
      nodeClaims.set(dom, { index: claim.index, isWrapper });
    } else {
      nodeClaims.set(dom, { index: controls.length, isWrapper });
      controls.push(entry);
    }
  }

  return controls;
})();

/**
 * Get rendered UI5 controls via the sap.ui.core element registry.
 * Interactable controls only by default; pass includeContainers for the full registry walk.
 */
export async function getUi5Controls(
  browser: WebdriverIO.Browser,
  params: GetUi5ControlsOptions = {},
): Promise<Ui5ControlInfo[]> {
  const { includeBounds = false, includeContainers = false, inViewportOnly = false } = params;
  return (browser as any).execute(ui5ControlsScript, includeBounds, includeContainers, inViewportOnly) as unknown as Promise<Ui5ControlInfo[]>;
}

export default ui5ControlsScript;
