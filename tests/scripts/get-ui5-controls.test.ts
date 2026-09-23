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

function makeNode(text: string, rect: Rect, connected = true): HTMLElement {
  const node = document.createElement('div');
  node.textContent = text;
  Object.defineProperty(node, 'getBoundingClientRect', { value: () => rect });
  if (connected) document.body.appendChild(node);
  return node;
}

function makeControl(node: HTMLElement | null, id: string, metadata = 'sap.m.Button', value?: string) {
  return {
    getId: () => id,
    getDomRef: () => node,
    getMetadata: () => ({ getName: () => metadata }),
    ...(value === undefined ? {} : { getValue: () => value }),
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