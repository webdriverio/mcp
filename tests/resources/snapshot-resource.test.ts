import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wdio/elements', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
  getState: vi.fn(() => ({ currentSession: 'session-1' })),
}));

import { getSnapshot } from '@wdio/elements';
import { getBrowser } from '../../src/session/state';
import { readSnapshot, snapshotResource } from '../../src/resources/snapshot.resource';
import { clearRefs, resolveRef } from '../../src/session/element-refs';

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;
const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;

const oneElement = {
  text: '[Page: Home]\n  e1  button "Go"  →  //button[contains(., "Go")]',
  elements: { e1: { selector: '#go', tagName: 'button', role: 'button', text: 'Go' } },
};

function stubBrowser(execute: () => Promise<unknown>) {
  mockGetBrowser.mockReturnValue({ isAndroid: false, isIOS: false, execute: vi.fn(execute) });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRefs('session-1');
  stubBrowser(async () => ({ readyState: 'complete', busy: 0 }));
  mockGetSnapshot.mockResolvedValue(oneElement);
});

describe('readSnapshot', () => {
  it('is viewport-only by default and keeps the snapshot text intact', async () => {
    const result = await readSnapshot();

    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: true });
    expect(result.text).toContain('[Page: Home]');
    expect(result.text).toContain('button "Go"');
  });

  it('stamps refs with the generation so later snapshots can invalidate them', async () => {
    const result = await readSnapshot();

    expect(result.text).toMatch(/^\s*e1@\d+\s\s+button "Go"/m);
  });

  it('forwards inViewportOnly false and reflects the wider scope in the footer', async () => {
    const result = await readSnapshot({ inViewportOnly: false });

    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: false });
    expect(result.text).toContain('[1 interactive element on page]');
  });

  it('does not recommend get_snapshot when already running the whole page', async () => {
    mockGetSnapshot.mockResolvedValue({ text: '[Page: Home]', elements: {} });

    const result = await readSnapshot({ inViewportOnly: false });

    expect(result.text).toContain('No interactive elements on page');
    expect(result.text).not.toContain('get_snapshot');
  });

  it('reports the element count so a short tree is distinguishable from a cut one', async () => {
    const result = await readSnapshot();
    expect(result.text).toContain('[1 interactive element in viewport]');
  });

  it('pluralises when several elements are present', async () => {
    mockGetSnapshot.mockResolvedValue({
      text: '[Page: Home]',
      elements: {
        e1: { selector: '#a', tagName: 'a', role: 'link', text: 'A' },
        e2: { selector: '#b', tagName: 'a', role: 'link', text: 'B' },
      },
    });

    const result = await readSnapshot();
    expect(result.text).toContain('[2 interactive elements in viewport]');
  });

  it('explains an empty tree using the page state and points at the tool', async () => {
    mockGetSnapshot.mockResolvedValue({ text: '[Page: Home]', elements: {} });
    stubBrowser(async () => ({ readyState: 'loading', busy: 3 }));

    const result = await readSnapshot();

    expect(result.text).toContain('No interactive elements in viewport');
    expect(result.text).toContain('document.readyState="loading"');
    expect(result.text).toContain('3 aria-busy region(s)');
    expect(result.text).toContain('get_snapshot');
  });

  it('still reports an empty tree when the page-state probe fails', async () => {
    mockGetSnapshot.mockResolvedValue({ text: '[Page: Home]', elements: {} });
    stubBrowser(async () => {
      throw new Error('execute unavailable');
    });

    const result = await readSnapshot();

    expect(result.text).toContain('No interactive elements in viewport');
    expect(result.text).not.toContain('readyState');
  });

  it('skips the page-state probe on mobile', async () => {
    const execute = vi.fn();
    mockGetBrowser.mockReturnValue({ isAndroid: true, isIOS: false, execute });

    await readSnapshot();

    expect(execute).not.toHaveBeenCalled();
  });

  it('reports failures as text', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('no session'));

    const result = await readSnapshot();

    expect(result.text).toContain('no session');
  });

  it('stores the elements map so the refs printed in the tree resolve', async () => {
    const result = await readSnapshot();
    const stamped = result.text.match(/^\s*(e1@\d+)\s\s/m)?.[1];

    expect(stamped).toBeDefined();
    expect(resolveRef(stamped!)).toBe('#go');
  });
});

describe('snapshot resource', () => {
  it('serves the same text as readSnapshot', async () => {
    const handler = snapshotResource.handler as unknown as () => Promise<{
      contents: { uri: string; mimeType: string; text: string }[];
    }>;

    const result = await handler();

    expect(result.contents[0].uri).toBe('wdio://session/current/snapshot');
    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('[1 interactive element in viewport]');
  });
});
