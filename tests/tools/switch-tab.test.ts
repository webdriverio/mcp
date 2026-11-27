import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../src/session/state';
import { ACTION_TIMEOUT_MS } from '../../src/session/agent';
import { tabSelectionGeneration } from '../../src/session/tab-selection';
import { switchTabTool } from '../../src/tools/tabs.tool';

const callTool = switchTabTool as unknown as (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean
}>;

const mockGetWindowHandles = vi.fn();
const mockGetWindowHandle = vi.fn();
const mockSwitchToWindow = vi.fn();

vi.mock('../../src/session/state', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('../../src/session/state')>();
  return {
    ...actual,
  };
});

vi.mock('webdriverio', () => ({ remote: vi.fn() }));
vi.mock('../../src/session/lifecycle', () => ({
  registerSession: vi.fn(),
  closeSession: vi.fn(),
}));
vi.mock('../../src/providers/local-browser.provider', () => ({
  localBrowserProvider: { buildCapabilities: vi.fn(() => ({})) },
}));

function setupSession(sessionId: string) {
  const state = getState();
  state.browsers.set(sessionId, {
    getWindowHandles: mockGetWindowHandles,
    getWindowHandle: mockGetWindowHandle,
    switchToWindow: mockSwitchToWindow,
  } as any);
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, { type: 'browser', capabilities: {}, isAttached: false });
  state.sessionHistory.set(sessionId, {
    sessionId,
    type: 'browser',
    startedAt: new Date().toISOString(),
    capabilities: {},
    steps: []
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('switch_tab', () => {
  it('switches by handle', async () => {
    setupSession('s1');
    mockSwitchToWindow.mockResolvedValue(undefined);
    const result = await callTool({ handle: 'handle-1' });
    expect(mockSwitchToWindow).toHaveBeenCalledWith('handle-1');
    expect(result.content[0].text).toContain('handle-1');
  });

  it('advances the tab selection generation when switching by handle', async () => {
    setupSession('s6');
    const browser = getState().browsers.get('s6')!;
    const before = tabSelectionGeneration(browser);
    mockSwitchToWindow.mockResolvedValue(undefined);
    await callTool({ handle: 'handle-1' });
    expect(tabSelectionGeneration(browser)).toBe(before + 1);
  });

  it('advances the tab selection generation when switching by index', async () => {
    setupSession('s7');
    const browser = getState().browsers.get('s7')!;
    const before = tabSelectionGeneration(browser);
    mockGetWindowHandles.mockResolvedValue(['h0', 'h1']);
    mockSwitchToWindow.mockResolvedValue(undefined);
    await callTool({ index: 1 });
    expect(tabSelectionGeneration(browser)).toBe(before + 1);
  });

  it('switches by index', async () => {
    setupSession('s2');
    mockGetWindowHandles.mockResolvedValue(['h0', 'h1', 'h2']);
    mockSwitchToWindow.mockResolvedValue(undefined);
    const result = await callTool({ index: 1 });
    expect(mockSwitchToWindow).toHaveBeenCalledWith('h1');
    expect(result.isError).toBeFalsy();
  });

  it('returns error for out of range index', async () => {
    setupSession('s3');
    mockGetWindowHandles.mockResolvedValue(['h0', 'h1']);
    const result = await callTool({ index: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('out of range');
  });

  it('fails with the action timeout when switching never answers', async () => {
    vi.useFakeTimers();
    try {
      setupSession('s5');
      mockSwitchToWindow.mockReturnValue(new Promise(() => {}));
      const pending = callTool({ handle: 'handle-1' });
      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS);
      const result = await pending;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('"switch_tab" did not finish within 30s');
      expect(result.content[0].text).toContain('call get_tabs');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns error when neither handle nor index provided', async () => {
    setupSession('s4');
    const result = await callTool({});
    expect(result.isError).toBe(true);
  });
});
