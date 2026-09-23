import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBrowser: vi.fn(),
  getState: vi.fn(),
  ensureUi5Injected: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: mocks.getBrowser,
  getState: mocks.getState,
}));

vi.mock('../../src/ui5/runtime', () => ({ ensureUi5Injected: mocks.ensureUi5Injected }));

import { clickTool } from '../../src/tools/click.tool';
import { setValueTool } from '../../src/tools/set-value.tool';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const callClick = clickTool as unknown as ToolFn;
const callSetValue = setValueTool as unknown as ToolFn;

const UI5_BUTTON = 'ui5:{"controlType":"sap.m.Button"}';

let press: ReturnType<typeof vi.fn>;
let enterText: ReturnType<typeof vi.fn>;
let asControl: ReturnType<typeof vi.fn>;
let element: Record<string, ReturnType<typeof vi.fn>>;
let browser: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  press = vi.fn(async () => {});
  enterText = vi.fn(async () => {});
  asControl = vi.fn(async () => ({ press, enterText, getWebElement: vi.fn() }));
  element = {
    isExisting: vi.fn(async () => true),
    scrollIntoView: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    clearValue: vi.fn(async () => {}),
    setValue: vi.fn(async () => {}),
  };
  browser = {
    asControl,
    $: vi.fn(() => element),
    waitUntil: vi.fn(async (fn: () => Promise<unknown>) => { await fn(); }),
  };
  mocks.getBrowser.mockReturnValue(browser);
  mocks.getState.mockReturnValue({
    currentSession: 's1',
    sessionMetadata: new Map([['s1', { runtime: 'ui5' }]]),
    sessionHistory: new Map(),
  });
  mocks.ensureUi5Injected.mockResolvedValue(undefined);
});

describe('ui5 control actions', () => {
  it('clicks a ui5 control through asControl().press()', async () => {
    const result = await callClick({ selector: UI5_BUTTON });

    expect(result.isError).toBeUndefined();
    expect(mocks.ensureUi5Injected).toHaveBeenCalledWith(browser);
    expect(asControl).toHaveBeenCalledWith({ selector: { controlType: 'sap.m.Button' }, forceSelect: false, timeout: 3000 });
    expect(press).toHaveBeenCalledTimes(1);
    expect(browser.$).not.toHaveBeenCalled();
  });

  it('enters text into a ui5 control through asControl().enterText()', async () => {
    const result = await callSetValue({ selector: 'ui5:{"controlType":"sap.m.Input"}', value: 'hi' });

    expect(result.isError).toBeUndefined();
    expect(asControl).toHaveBeenCalledWith({ selector: { controlType: 'sap.m.Input' }, forceSelect: false, timeout: 3000 });
    expect(enterText).toHaveBeenCalledWith('hi');
    expect(browser.$).not.toHaveBeenCalled();
  });

  it('forwards the timeout as a sibling of the ui5 selector object', async () => {
    await callClick({ selector: UI5_BUTTON, timeout: 5000 });

    expect(asControl).toHaveBeenCalledWith({ selector: { controlType: 'sap.m.Button' }, forceSelect: false, timeout: 5000 });
  });

  it('rejects an invalid ui5 selector payload', async () => {
    const clicked = await callClick({ selector: 'ui5:notjson' });
    const typed = await callSetValue({ selector: 'ui5:notjson', value: 'x' });

    expect(clicked.isError).toBe(true);
    expect(clicked.content[0].text).toContain('Invalid ui5 selector');
    expect(typed.isError).toBe(true);
    expect(typed.content[0].text).toContain('Invalid ui5 selector');
    expect(asControl).not.toHaveBeenCalled();
  });

  it('uses browser.$ for a plain CSS selector', async () => {
    const clicked = await callClick({ selector: '#btn' });
    const typed = await callSetValue({ selector: '#input', value: 'hello' });

    expect(clicked.isError).toBeUndefined();
    expect(typed.isError).toBeUndefined();
    expect(asControl).not.toHaveBeenCalled();
    expect(mocks.ensureUi5Injected).not.toHaveBeenCalled();
    expect(browser.$).toHaveBeenCalledWith('#btn');
    expect(element.click).toHaveBeenCalledTimes(1);
    expect(browser.$).toHaveBeenCalledWith('#input');
    expect(element.clearValue).toHaveBeenCalledTimes(1);
    expect(element.setValue).toHaveBeenCalledWith('hello');
  });
});