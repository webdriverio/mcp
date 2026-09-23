import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUi5Controls } from '../../src/scripts/get-ui5-controls';

const mockBrowser = {
  execute: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
} as unknown as WebdriverIO.Browser;

interface Rect {
  x: number;
  y: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

const VISIBLE_RECT: Rect = { x: 10, y: 10, top: 10, left: 10, bottom: 30, right: 110, width: 100, height: 20 };
const ZERO_RECT: Rect = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
const OFFSCREEN_RECT: Rect = { x: 10, y: -10, top: -10, left: 10, bottom: 10, right: 110, width: 100, height: 20 };

function makeNode(text: string, rect: Rect, connected = true): HTMLElement {
  const node = document.createElement('div');
  node.textContent = text;
  Object.defineProperty(node, 'getBoundingClientRect', { value: () => rect });
  if (connected) document.body.appendChild(node);
  return node;
}

function makeControl(
  node: HTMLElement | null,
  id: string,
  metadata = 'sap.m.Button',
  value?: string,
  extras: { text?: string; title?: string; placeholder?: string; href?: string; selected?: boolean; state?: boolean } = {},
) {
  return {
    getId: () => id,
    getDomRef: () => node,
    getMetadata: () => ({ getName: () => metadata }),
    ...(value === undefined ? {} : { getValue: () => value }),
    ...(extras.text === undefined ? {} : { getText: () => extras.text }),
    ...(extras.title === undefined ? {} : { getTitle: () => extras.title }),
    ...(extras.placeholder === undefined ? {} : { getPlaceholder: () => extras.placeholder }),
    ...(extras.href === undefined ? {} : { getHref: () => extras.href }),
    ...(extras.selected === undefined ? {} : { getSelected: () => extras.selected }),
    ...(extras.state === undefined ? {} : { getState: () => extras.state }),
  };
}

function installUi5(controls: unknown[], findControlSelectorByDOMElement: ReturnType<typeof vi.fn> = vi.fn()) {
  const w = window as unknown as Record<string, unknown>;
  w.sap = { ui: { core: { Element: { registry: { all: () => controls } } } } };
  w.wdi5 = {};
  w.bridge = {
    waitForUI5: async () => {},
    findControlSelectorByDOMElement,
  };
  return findControlSelectorByDOMElement;
}

const defaultFind = () => vi.fn(async () => ({ controlType: 'sap.m.Button', viewName: 'test.view' }));

function buildRegistry() {
  const button = makeNode('Press', VISIBLE_RECT);
  const input = makeNode('', VISIBLE_RECT);
  const zeroSize = makeNode('Collapsed', ZERO_RECT);
  const removed = makeNode('Detached', VISIBLE_RECT, false);
  return {
    button,
    input,
    zeroSize,
    removed,
    controls: [
      makeControl(button, 'btn1'),
      makeControl(input, 'input1', 'sap.m.Input', 'hello'),
      makeControl(zeroSize, 'collapsed1'),
      makeControl(removed, 'detached1'),
      makeControl(makeNode('Boom', VISIBLE_RECT), 'boom1'),
      makeControl(makeNode('Panel', VISIBLE_RECT), 'panel1', 'sap.m.Panel'),
    ],
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  HTMLElement.prototype.getBoundingClientRect = () => VISIBLE_RECT as unknown as DOMRect;
});

afterEach(() => {
  const w = window as unknown as Record<string, unknown>;
  delete w.sap;
  delete w.wdi5;
  delete w.bridge;
  document.body.innerHTML = '';
});

describe('getUi5Controls', () => {
  it('returns connected, sized, resolvable controls with ui5: selectors', async () => {
    const { controls } = buildRegistry();
    installUi5(controls, vi.fn(async ({ domElement }: { domElement: HTMLElement }) =>
      domElement.textContent === 'Boom'
        ? Promise.reject(new Error('no stable selector'))
        : { controlType: 'sap.m.Button', viewName: 'test.view' }));

    const result = await getUi5Controls(mockBrowser);

    expect(result).toHaveLength(2);
    const [button, input] = result;
    expect(button.tagName).toBe('sap.m.Button');
    expect(button.name).toBe('Press');
    expect(button.value).toBe('');
    expect(button.isInViewport).toBe(true);
    expect(button.selector.startsWith('ui5:')).toBe(true);
    expect(JSON.parse(button.selector.slice('ui5:'.length))).toEqual({
      controlType: 'sap.m.Button',
      viewName: 'test.view',
    });

    expect(input.tagName).toBe('sap.m.Input');
    expect(input.value).toBe('hello');
  });

  it('skips offscreen controls before resolving their selector when inViewportOnly is set', async () => {
    const offscreen = makeNode('Hidden', OFFSCREEN_RECT);
    const find = vi.fn(async () => ({ controlType: 'sap.m.Button', viewName: 'test.view' }));
    installUi5([makeControl(offscreen, 'off1')], find);

    const filtered = await getUi5Controls(mockBrowser, { inViewportOnly: true });
    expect(filtered).toHaveLength(0);
    expect(find).not.toHaveBeenCalled();

    const unfiltered = await getUi5Controls(mockBrowser);
    expect(unfiltered).toHaveLength(1);
    expect(unfiltered[0].isInViewport).toBe(false);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('filters disconnected and zero-size controls and skips controls without a selector', async () => {
    const { controls } = buildRegistry();
    installUi5(controls, vi.fn(async ({ domElement }: { domElement: HTMLElement }) =>
      domElement.textContent === 'Boom'
        ? Promise.reject(new Error('no stable selector'))
        : { controlType: 'sap.m.Button' }));

    const result = await getUi5Controls(mockBrowser);

    expect(result).toHaveLength(2);
    expect(result.map(c => c.tagName)).toEqual(['sap.m.Button', 'sap.m.Input']);
  });

  it('omits boundingBox by default and includes it when requested', async () => {
    const { controls } = buildRegistry();
    installUi5(controls, defaultFind());

    const withoutBounds = await getUi5Controls(mockBrowser);
    expect(withoutBounds[0].boundingBox).toBeUndefined();

    const withBounds = await getUi5Controls(mockBrowser, { includeBounds: true });
    expect(withBounds[0].boundingBox).toEqual({ x: 10, y: 10, width: 100, height: 20 });
  });

  it('excludes layout containers by default and includes them on demand', async () => {
    const { controls } = buildRegistry();
    installUi5(controls, defaultFind());

    const interactableOnly = await getUi5Controls(mockBrowser);
    expect(interactableOnly.map(c => c.tagName)).not.toContain('sap.m.Panel');

    const withContainers = await getUi5Controls(mockBrowser, { includeContainers: true });
    expect(withContainers.map(c => c.tagName)).toEqual(
      expect.arrayContaining(['sap.m.Button', 'sap.m.Input', 'sap.m.Panel']),
    );
  });

  it('matches compound and custom-namespace control types partially', async () => {
    const toggleNode = makeNode('Toggle', VISIBLE_RECT);
    const customNode = makeNode('Custom', VISIBLE_RECT);
    installUi5([
      makeControl(toggleNode, 'toggle1', 'sap.m.ToggleButton'),
      makeControl(customNode, 'custom1', 'com.my.CustomButton'),
      makeControl(makeNode('Bar', VISIBLE_RECT), 'bar1', 'sap.m.Bar'),
    ], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    expect(result.map(c => c.tagName)).toEqual(['sap.m.ToggleButton', 'com.my.CustomButton']);
  });

  it("prefers the control's own label over rendered text", async () => {
    installUi5([
      makeControl(makeNode('Accessories34', VISIBLE_RECT), 'a1', 'sap.m.Button', undefined, { text: 'Accessories' }),
      makeControl(makeNode('29,00 EUREmphasizedCordless Bluetooth Keyboard', VISIBLE_RECT), 'b1', 'sap.m.ObjectListItem', undefined, { title: 'Cordless Bluetooth Keyboard' }),
      makeControl(makeNode('', VISIBLE_RECT), 'c1', 'sap.m.Input', undefined, { placeholder: 'Enter your street name and house number' }),
      makeControl(makeNode('Fallback Text', VISIBLE_RECT), 'd1', 'sap.m.Link'),
      makeControl(makeNode('', VISIBLE_RECT), 'e1', 'sap.m.CheckBox'),
    ], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    const byTag = Object.fromEntries(result.map(c => [c.tagName, c.name]));

    expect(byTag['sap.m.Button']).toBe('Accessories');
    expect(byTag['sap.m.ObjectListItem']).toBe('Cordless Bluetooth Keyboard');
    expect(byTag['sap.m.Input']).toBe('Enter your street name and house number');
    expect(byTag['sap.m.Link']).toBe('Fallback Text');
    expect(byTag['sap.m.CheckBox']).toBe('e1');
  });

  it('prefers getText over getTitle when both are present', async () => {
    installUi5([
      makeControl(makeNode('PrimarySecondary', VISIBLE_RECT), 'both1', 'sap.m.Button', undefined, { text: 'Primary', title: 'Secondary' }),
    ], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    expect(result[0].name).toBe('Primary');
  });

  it('reads href from the control instead of leaving it empty', async () => {
    installUi5([
      makeControl(makeNode('Product', VISIBLE_RECT), 'link1', 'sap.m.Link', undefined, { href: "#/Products('HT-1120')" }),
      makeControl(makeNode('Plain', VISIBLE_RECT), 'plain1', 'sap.m.Button'),
    ], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    expect(result.find(c => c.tagName === 'sap.m.Link')?.href).toBe("#/Products('HT-1120')");
    expect(result.find(c => c.tagName === 'sap.m.Button')?.href).toBe('');
  });

  it('emits one row per DOM node when two controls share it, keeping the first', async () => {
    const shared = makeNode('Item', VISIBLE_RECT);
    installUi5([
      makeControl(shared, 'first1', 'sap.m.Button'),
      makeControl(shared, 'second1', 'sap.m.Link'),
    ], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    expect(result).toHaveLength(1);
    expect(result[0].tagName).toBe('sap.m.Button');
  });

  it('excludes SegmentedButtonItem by default and includes it with includeContainers', async () => {
    const shared = makeNode('Item', VISIBLE_RECT);
    installUi5([
      makeControl(makeNode('Item', VISIBLE_RECT), 'seg1', 'sap.m.SegmentedButtonItem'),
      makeControl(shared, 'seg2', 'sap.m.SegmentedButtonItem'),
      makeControl(shared, 'seg2-button', 'sap.m.Button'),
    ], defaultFind());

    const byDefault = await getUi5Controls(mockBrowser);
    expect(byDefault.map(c => c.tagName)).toEqual(['sap.m.Button']);

    const withContainers = await getUi5Controls(mockBrowser, { includeContainers: true });
    expect(withContainers.map(c => c.tagName)).toEqual(['sap.m.SegmentedButtonItem', 'sap.m.Button']);
  });

  it('lets a sibling claim a node when the first control has no resolvable selector', async () => {
    const shared = makeNode('Item', VISIBLE_RECT);
    const find = vi.fn()
      .mockRejectedValueOnce(new Error('no stable selector'))
      .mockResolvedValue({ controlType: 'sap.m.Link', viewName: 'test.view' });
    installUi5([
      makeControl(shared, 'first1', 'sap.m.Button'),
      makeControl(shared, 'second1', 'sap.m.Link'),
    ], find);

    const result = await getUi5Controls(mockBrowser);
    expect(result).toHaveLength(1);
    expect(result[0].tagName).toBe('sap.m.Link');
  });

  it('reads checkbox and switch state into value', async () => {
    installUi5([
      makeControl(makeNode('Subscribe', VISIBLE_RECT), 'chk1', 'sap.m.CheckBox', undefined, { text: 'Subscribe', selected: true }),
      makeControl(makeNode('Toggle', VISIBLE_RECT), 'sw1', 'sap.m.Switch', undefined, { state: false }),
      makeControl(makeNode('Plain', VISIBLE_RECT), 'plain1', 'sap.m.Button'),
    ], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    expect(result.find(c => c.tagName === 'sap.m.CheckBox')?.value).toBe('true');
    expect(result.find(c => c.tagName === 'sap.m.Switch')?.value).toBe('false');
    expect(result.find(c => c.tagName === 'sap.m.Button')?.value).toBe('');
  });

  it('skips a control whose label getter throws instead of failing the listing', async () => {
    const { controls } = buildRegistry();
    const throwing = {
      getId: () => 'throw1',
      getDomRef: () => makeNode('Safe Fallback', VISIBLE_RECT),
      getMetadata: () => ({ getName: () => 'sap.m.Button' }),
      getText: () => { throw new Error('binding not resolved'); },
    };
    installUi5([...controls, throwing], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    expect(result).toHaveLength(4);
    expect(result.find(c => c.name === 'Safe Fallback')?.tagName).toBe('sap.m.Button');
  });

  it('discovers icon, datetime picker, tree item and breadcrumb controls, excluding container false-positives', async () => {
    installUi5([
      makeControl(makeNode('Star', VISIBLE_RECT), 'icon1', 'sap.ui.core.Icon'),
      makeControl(makeNode('When', VISIBLE_RECT), 'dtp1', 'sap.m.DateTimePicker'),
      makeControl(makeNode('Node', VISIBLE_RECT), 'tree1', 'sap.m.StandardTreeItem'),
      makeControl(makeNode('Home', VISIBLE_RECT), 'bc1', 'sap.m.Breadcrumbs'),
      makeControl(makeNode('Seg', VISIBLE_RECT), 'segBtn1', 'sap.m.SegmentedButton'),
      makeControl(makeNode('Tiles', VISIBLE_RECT), 'tc1', 'sap.m.TileContainer'),
    ], defaultFind());

    const result = await getUi5Controls(mockBrowser);
    expect(result.map(c => c.tagName)).toEqual(
      ['sap.ui.core.Icon', 'sap.m.DateTimePicker', 'sap.m.StandardTreeItem', 'sap.m.Breadcrumbs'],
    );
  });

  it('matches SegmentedButtonItem subclasses by prototype, not by name', async () => {
    class SegmentedButtonItem {}
    const node = makeNode('Pay', VISIBLE_RECT);
    const instance = Object.assign(new SegmentedButtonItem(), {
      getId: () => 'sub1',
      getDomRef: () => node,
      getMetadata: () => ({ getName: () => 'com.my.PayToggle' }),
    });
    installUi5([instance], defaultFind());
    ((window as unknown as Record<string, unknown>).sap as Record<string, unknown>).m = { SegmentedButtonItem };

    const byDefault = await getUi5Controls(mockBrowser);
    expect(byDefault).toHaveLength(0);

    const withContainers = await getUi5Controls(mockBrowser, { includeContainers: true });
    expect(withContainers.map(c => c.tagName)).toEqual(['com.my.PayToggle']);
  });

  it('rejects when the UI5 registry is unavailable', async () => {
    installUi5([]);
    delete (window as unknown as Record<string, unknown>).sap;

    await expect(getUi5Controls(mockBrowser)).rejects.toThrow('No UI5 runtime found');
  });

  it('rejects when the wdi5 bridge is not injected', async () => {
    installUi5([]);
    const w = window as unknown as Record<string, unknown>;
    delete w.wdi5;
    delete w.bridge;

    await expect(getUi5Controls(mockBrowser)).rejects.toThrow('wdi5 bridge not injected');
  });
});