import type { ResourceDefinition } from '../types/resource';
import { getBrowser, getState } from '../session/state';
import { getSnapshot } from '@wdio/elements';
import { stampRefs, storeRefs } from '../session/element-refs';

const uri = 'wdio://session/current/snapshot';

interface PageState {
  readyState: string;
  busy: number;
}

async function readPageState(browser: WebdriverIO.Browser): Promise<PageState | undefined> {
  if (browser.isAndroid || browser.isIOS) return undefined;
  try {
    return await browser.execute(() => ({
      readyState: document.readyState,
      busy: document.querySelectorAll('[aria-busy="true"]').length,
    }));
  } catch {
    return undefined;
  }
}

/**
 * The snapshot has no counts of its own, so an empty tree is indistinguishable
 * from a page that is still rendering. Say which, and point at the escape hatch.
 */
function buildFooter(count: number, inViewportOnly: boolean, state: PageState | undefined): string {
  const scope = inViewportOnly ? 'in viewport' : 'on page';
  if (count > 0) {
    return `[${count} interactive element${count === 1 ? '' : 's'} ${scope}]`;
  }
  const probe = state ? `document.readyState="${state.readyState}", ${state.busy} aria-busy region(s). ` : '';
  const escape = inViewportOnly ? '; try the get_snapshot tool for the whole page' : '';
  return `[No interactive elements ${scope} — ${probe}Page may still be rendering${escape}.]`;
}

export async function readSnapshot(params: { inViewportOnly?: boolean } = {}): Promise<{ mimeType: string; text: string }> {
  try {
    const { inViewportOnly = true } = params;
    const browser = getBrowser();
    const { text, elements } = await getSnapshot(browser, { inViewportOnly });

    const sessionId = getState().currentSession;
    const stamped = sessionId ? stampRefs(text, storeRefs(sessionId, elements)) : text;

    // The probe only informs the empty-tree message; skip the round-trip otherwise.
    const count = Object.keys(elements).length;
    const state = count === 0 ? await readPageState(browser) : undefined;
    const footer = buildFooter(count, inViewportOnly, state);

    return { mimeType: 'text/plain', text: `${stamped}\n${footer}` };
  } catch (e) {
    return { mimeType: 'text/plain', text: `Error getting snapshot: ${e}` };
  }
}

export const snapshotResource: ResourceDefinition = {
  name: 'session-current-snapshot',
  uri,
  description:
    'Depth-indented text snapshot of the current page with interactive elements and selectors, ' +
    'limited to the current viewport. Each interactive element includes a ready-to-use WebdriverIO ' +
    'selector and an `eN` reference accepted by click_element, set_value, tap_element and ' +
    'drag_and_drop. Prefer this over the elements resource for spatial/hierarchical understanding ' +
    'of the page. Use the get_snapshot tool to include off-screen content.',
  handler: async () => {
    const result = await readSnapshot({});
    return { contents: [{ uri, mimeType: result.mimeType, text: result.text }] };
  },
};
