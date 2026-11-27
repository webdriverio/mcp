import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
}));

import { getBrowser } from '../../src/session/state';
import { readTabs, tabsResource } from '../../src/resources/tabs.resource';
import { ACTION_TIMEOUT_MS } from '../../src/session/agent';
import { noteTabSelected } from '../../src/session/tab-selection';

const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readTabs', () => {
  it('reads titles and urls over BiDi without switching windows', async () => {
    const browser = {
      isBidi: true,
      getWindowHandles: vi.fn().mockResolvedValue(['h0', 'h1']),
      getWindowHandle: vi.fn().mockResolvedValue('h0'),
      switchToWindow: vi.fn(),
      browsingContextGetTree: vi.fn().mockResolvedValue({ contexts: [{ context: 'h0', url: 'https://a.test/' }, { context: 'h1', url: 'data:text/html,x' }] }),
      scriptEvaluate: vi.fn(({ target }) => Promise.resolve({
        type: 'success',
        result: { type: 'string', value: target.context === 'h0' ? 'Home' : '' },
      })),
    };
    mockGetBrowser.mockReturnValue(browser);

    const result = await readTabs();

    expect(browser.switchToWindow).not.toHaveBeenCalled();
    expect(browser.browsingContextGetTree).toHaveBeenCalledWith({ maxDepth: 0 });
    expect(browser.scriptEvaluate).toHaveBeenCalledWith({ expression: 'document.title', target: { context: 'h1' }, awaitPromise: false });
    expect(result.mimeType).toBe('application/json');
    expect(JSON.parse(result.text)).toEqual([
      { handle: 'h0', title: 'Home', url: 'https://a.test/', isActive: true },
      { handle: 'h1', title: '', url: 'data:text/html,x', isActive: false },
    ]);
  });

  it('gives an empty title when the BiDi title read fails', async () => {
    mockGetBrowser.mockReturnValue({
      isBidi: true,
      getWindowHandles: vi.fn().mockResolvedValue(['h0']),
      getWindowHandle: vi.fn().mockResolvedValue('h0'),
      browsingContextGetTree: vi.fn().mockResolvedValue({ contexts: [{ context: 'h0', url: 'about:blank' }] }),
      scriptEvaluate: vi.fn().mockRejectedValue(new Error('no realm')),
    });

    const result = await readTabs();

    expect(JSON.parse(result.text)).toEqual([{ handle: 'h0', title: '', url: 'about:blank', isActive: true }]);
  });

  it('restores the original window on the classic path when getTitle throws', async () => {
    const switchToWindow = vi.fn().mockResolvedValue(undefined);
    mockGetBrowser.mockReturnValue({
      isBidi: false,
      getWindowHandles: vi.fn().mockResolvedValue(['h0', 'h1']),
      getWindowHandle: vi.fn().mockResolvedValue('h0'),
      switchToWindow,
      getTitle: vi.fn().mockRejectedValue(new Error('timeout')),
      getUrl: vi.fn().mockResolvedValue('about:blank'),
    });

    const result = await readTabs();

    expect(switchToWindow).toHaveBeenLastCalledWith('h0');
    expect(result.mimeType).toBe('text/plain');
    expect(result.text).toContain('timeout');
  });

  it('returns the timeout as the error response when the browser stops answering', async () => {
    vi.useFakeTimers();
    try {
      mockGetBrowser.mockReturnValue({
        isBidi: false,
        getWindowHandles: vi.fn(() => new Promise(() => {})),
        getWindowHandle: vi.fn(),
      });

      const pending = (tabsResource.handler as unknown as () => Promise<{ contents: { mimeType: string; text: string }[] }>)();
      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS);
      const { contents } = await pending;

      expect(contents[0].mimeType).toBe('text/plain');
      expect(contents[0].text).toContain('"get_tabs" did not finish within 30s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops switching after the action timeout and returns to the original window', async () => {
    vi.useFakeTimers();
    try {
      const switchToWindow = vi.fn().mockResolvedValue(undefined);
      mockGetBrowser.mockReturnValue({
        isBidi: false,
        getWindowHandles: vi.fn().mockResolvedValue(['h0', 'h1']),
        getWindowHandle: vi.fn().mockResolvedValue('h0'),
        switchToWindow,
        getTitle: vi.fn(() => new Promise((resolve) => setTimeout(() => resolve('A'), ACTION_TIMEOUT_MS + 1_000))),
        getUrl: vi.fn().mockResolvedValue('https://a.test/'),
      });

      const pending = readTabs();
      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS + 1_000);
      const result = await pending;

      expect(result.text).toContain('did not finish within 30s');
      expect(switchToWindow.mock.calls).toEqual([['h0'], ['h0']]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads classic tabs and returns to the original window', async () => {
    const switchToWindow = vi.fn().mockResolvedValue(undefined);
    mockGetBrowser.mockReturnValue({
      isBidi: false,
      getWindowHandles: vi.fn().mockResolvedValue(['h0', 'h1']),
      getWindowHandle: vi.fn().mockResolvedValue('h1'),
      switchToWindow,
      getTitle: vi.fn().mockResolvedValueOnce('A').mockResolvedValueOnce('B'),
      getUrl: vi.fn().mockResolvedValueOnce('https://a.test/').mockResolvedValueOnce('https://b.test/'),
    });

    const result = await readTabs();

    expect(switchToWindow.mock.calls).toEqual([['h0'], ['h1'], ['h1']]);
    expect(JSON.parse(result.text)).toEqual([
      { handle: 'h0', title: 'A', url: 'https://a.test/', isActive: false },
      { handle: 'h1', title: 'B', url: 'https://b.test/', isActive: true },
    ]);
  });

  it('does not restore the original window when a selection lands while the current handle is read', async () => {
    const switchToWindow = vi.fn().mockResolvedValue(undefined);
    let releaseHandle: (handle: string) => void = () => {};
    const browser = {
      isBidi: false,
      getWindowHandles: vi.fn().mockResolvedValue(['h0', 'h1']),
      getWindowHandle: vi.fn(() => new Promise<string>((resolve) => { releaseHandle = resolve; })),
      switchToWindow,
      getTitle: vi.fn().mockResolvedValue('T'),
      getUrl: vi.fn().mockResolvedValue('https://a.test/'),
    };
    mockGetBrowser.mockReturnValue(browser);

    const pending = readTabs();
    await vi.waitFor(() => expect(browser.getWindowHandle).toHaveBeenCalled());
    noteTabSelected(browser as unknown as WebdriverIO.Browser);
    releaseHandle('h0');
    await pending;

    expect(switchToWindow.mock.calls).toEqual([['h0'], ['h1']]);
  });

  it('does not switch back after a timed-out classic read when another tab was selected meanwhile', async () => {
    vi.useFakeTimers();
    try {
      const switchToWindow = vi.fn().mockResolvedValue(undefined);
      let releaseTitle: (title: string) => void = () => {};
      const browser = {
        isBidi: false,
        getWindowHandles: vi.fn().mockResolvedValue(['h0', 'h1']),
        getWindowHandle: vi.fn().mockResolvedValue('h0'),
        switchToWindow,
        getTitle: vi.fn(() => new Promise<string>((resolve) => { releaseTitle = resolve; })),
        getUrl: vi.fn().mockResolvedValue('https://a.test/'),
      };
      mockGetBrowser.mockReturnValue(browser);

      const pending = readTabs();
      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS);
      await pending;

      noteTabSelected(browser as unknown as WebdriverIO.Browser);
      releaseTitle('A');
      await vi.advanceTimersByTimeAsync(0);

      expect(switchToWindow.mock.calls).toEqual([['h0']]);
    } finally {
      vi.useRealTimers();
    }
  });
});
