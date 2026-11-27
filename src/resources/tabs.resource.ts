import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';
import { activeSessionId, runInSessionQueue } from '../session/routing';
import { withActionTimeout } from '../session/agent';
import { SessionError } from '@wdio/session/agent';

type Tab = { handle: string; title: string; url: string; isActive: boolean };

async function readTabsBidi(browser: WebdriverIO.Browser, handles: string[], currentHandle: string): Promise<Tab[]> {
  const tree = await browser.browsingContextGetTree({ maxDepth: 0 });
  const urls = new Map(tree.contexts.map((context) => [context.context, context.url]));
  return Promise.all(handles.map(async (handle) => ({
    handle,
    title: await browser.scriptEvaluate({ expression: 'document.title', target: { context: handle }, awaitPromise: false })
      .then((res) => (res.type === 'success' && res.result.type === 'string' ? res.result.value : ''))
      .catch(() => ''),
    url: urls.get(handle) ?? '',
    isActive: handle === currentHandle,
  })));
}

async function readTabsClassic(browser: WebdriverIO.Browser, handles: string[], currentHandle: string, signal: AbortSignal): Promise<Tab[]> {
  const tabs: Tab[] = [];
  try {
    for (const handle of handles) {
      if (signal.aborted) break;
      await browser.switchToWindow(handle);
      tabs.push({ handle, title: await browser.getTitle(), url: await browser.getUrl(), isActive: handle === currentHandle });
    }
  } finally {
    // A read that timed out can finish after later tool calls; restoring would undo their tab selection.
    if (!signal.aborted) await browser.switchToWindow(currentHandle);
  }
  return tabs;
}

async function readOpenTabs(browser: WebdriverIO.Browser, signal: AbortSignal): Promise<Tab[]> {
  const handles = await browser.getWindowHandles();
  const currentHandle = await browser.getWindowHandle();
  return browser.isBidi
    ? readTabsBidi(browser, handles, currentHandle)
    : readTabsClassic(browser, handles, currentHandle, signal);
}

export async function readTabs(): Promise<{ mimeType: string; text: string }> {
  const abort = new AbortController();
  let browser: WebdriverIO.Browser | undefined;
  try {
    browser = getBrowser();
    const tabs = await withActionTimeout(readOpenTabs(browser, abort.signal), 'get_tabs').catch((e: unknown) => {
      abort.abort();
      throw e;
    });
    return { mimeType: 'application/json', text: JSON.stringify(tabs) };
  } catch (e) {
    const leftOnTab = e instanceof SessionError && e.code === 'TIMEOUT' && browser && !browser.isBidi;
    return { mimeType: 'text/plain', text: `Error: ${e}${leftOnTab ? ' The browser may be left on another tab; call switch_tab to choose one.' : ''}` };
  }
}

export const tabsResource: ResourceDefinition = {
  name: 'session-current-tabs',
  uri: 'wdio://session/current/tabs',
  description: 'Browser tabs in the current session',
  handler: async () => {
    // Resources skip the per-session queue; a classic read switches windows, so it must not interleave with switch_tab.
    const sessionId = activeSessionId();
    const result = sessionId ? await runInSessionQueue(sessionId, readTabs) : await readTabs();
    return { contents: [{ uri: 'wdio://session/current/tabs', mimeType: result.mimeType, text: result.text }] };
  },
};
