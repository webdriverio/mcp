const generations = new WeakMap<WebdriverIO.Browser, number>();

export function tabSelectionGeneration(browser: WebdriverIO.Browser): number {
  return generations.get(browser) ?? 0;
}

export function noteTabSelected(browser: WebdriverIO.Browser): void {
  generations.set(browser, tabSelectionGeneration(browser) + 1);
}
