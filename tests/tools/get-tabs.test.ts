import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_TIMEOUT_MS } from '../../src/session/agent';
import { getTabsTool } from '../../src/tools/get-tabs.tool';

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
}));

import { getBrowser } from '../../src/session/state';

const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;

const callTool = getTabsTool as unknown as () => Promise<{ content: { text: string }[]; isError?: boolean }>;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('get_tabs', () => {
  it('returns the tab list as JSON', async () => {
    mockGetBrowser.mockReturnValue({
      isBidi: true,
      getWindowHandles: vi.fn().mockResolvedValue(['h0']),
      getWindowHandle: vi.fn().mockResolvedValue('h0'),
      browsingContextGetTree: vi.fn().mockResolvedValue({ contexts: [{ context: 'h0', url: 'https://a.test/' }] }),
      scriptEvaluate: vi.fn().mockResolvedValue({ type: 'success', result: { type: 'string', value: 'Home' } }),
    });

    const result = await callTool();

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual([{ handle: 'h0', title: 'Home', url: 'https://a.test/', isActive: true }]);
  });

  it('reports a browser error as isError with the error text', async () => {
    mockGetBrowser.mockReturnValue({
      isBidi: false,
      getWindowHandles: vi.fn().mockRejectedValue(new Error('no such window')),
      getWindowHandle: vi.fn(),
    });

    const result = await callTool();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no such window');
  });

  it('fails with the action timeout when the browser stops answering', async () => {
    mockGetBrowser.mockReturnValue({
      isBidi: false,
      getWindowHandles: vi.fn(() => new Promise(() => {})),
      getWindowHandle: vi.fn(),
    });

    const pending = callTool();
    await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS);
    const result = await pending;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"get_tabs" did not finish within 30s');
  });
});
