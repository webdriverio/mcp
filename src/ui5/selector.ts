import { ensureUi5Injected } from './runtime';

export const UI5_SELECTOR_PREFIX = 'ui5:';

export function isUi5Selector(selector: string): boolean {
  return selector.startsWith(UI5_SELECTOR_PREFIX);
}

export function parseUi5Selector(selector: string): Record<string, unknown> {
  try {
    return JSON.parse(selector.slice(UI5_SELECTOR_PREFIX.length)) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid ui5 selector (expected '${UI5_SELECTOR_PREFIX}' + JSON object): ${selector}`);
  }
}

export interface Ui5Control {
  press(): Promise<void>;
  enterText(
    text: string,
    options?: { clearTextFirst?: boolean; pressEnterKey?: boolean; keepFocus?: boolean },
  ): Promise<void>;
  getWebElement(): Promise<WebdriverIO.Element>;
}

/** wdi5 attaches `asControl` to the browser at runtime (bridge setup), hence the cast. */
export async function getAsControl(
  browser: WebdriverIO.Browser,
  selector: string,
  timeout?: number,
): Promise<Ui5Control> {
  const parsed = parseUi5Selector(selector);
  const asControl = (browser as unknown as {
    asControl?: (o: { selector: Record<string, unknown>; forceSelect: boolean; timeout?: number }) => Promise<Ui5Control>;
  }).asControl;
  if (typeof asControl !== 'function') {
    throw new Error('wdi5 asControl command is not available on this session — is this a UI5 session?');
  }
  return asControl({ selector: parsed, forceSelect: false, ...(timeout ? { timeout } : {}) });
}

export async function resolveUi5Control(
  browser: WebdriverIO.Browser,
  selector: string,
  timeout?: number,
): Promise<Ui5Control> {
  await ensureUi5Injected(browser);
  return getAsControl(browser, selector, timeout);
}
