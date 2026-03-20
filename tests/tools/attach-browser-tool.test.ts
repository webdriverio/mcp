import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub fetch so getActiveTabUrl / closeStaleMappers / waitForCDP don't make real network requests
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue([{ type: 'page', url: 'https://example.com' }]),
}));

const mockBrowser = vi.hoisted(() => ({
  sessionId: 'attached-session-id',
  capabilities: {},
  getTitle: vi.fn().mockResolvedValue('My App'),
  url: vi.fn().mockResolvedValue(undefined),
  getUrl: vi.fn().mockResolvedValue('https://example.com'),
  getWindowHandles: vi.fn().mockResolvedValue(['handle-1']),
  switchToWindow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue(mockBrowser),
}));

vi.mock('../../src/tools/browser.tool', () => {
  const state = {
    browsers: new Map(),
    currentSession: null as string | null,
    sessionMetadata: new Map(),
    sessionHistory: new Map(),
  };
  const getBrowser = vi.fn(() => {
    const b = state.browsers.get(state.currentSession);
    if (!b) throw new Error('No active browser session');
    return b;
  });
  (getBrowser as any).__state = state;
  return { getBrowser };
});

import { remote } from 'webdriverio';
import { getBrowser } from '../../src/tools/browser.tool';
import { attachBrowserTool } from '../../src/tools/attach-browser.tool';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const callTool = (args: Record<string, unknown> = {}) =>
  (attachBrowserTool as unknown as ToolFn)(args);

const mockRemote = remote as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  const state = (getBrowser as any).__state;
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
  mockRemote.mockResolvedValue(mockBrowser);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue([{ type: 'page', url: 'https://example.com' }]),
  }));
});

describe('attach_browser', () => {
  it('calls remote() with debuggerAddress using default port 9222', async () => {
    await callTool();
    expect(mockRemote).toHaveBeenCalledWith({
      connectionRetryTimeout: 30000,
      connectionRetryCount: 3,
      capabilities: expect.objectContaining({
        browserName: 'chrome',
        unhandledPromptBehavior: 'dismiss',
        'goog:chromeOptions': { debuggerAddress: 'localhost:9222' },
      }),
    });
  });

  it('uses provided host and port', async () => {
    await callTool({ host: '192.168.1.1', port: 9333 });
    expect(mockRemote).toHaveBeenCalledWith(expect.objectContaining({
      capabilities: expect.objectContaining({
        'goog:chromeOptions': expect.objectContaining({ debuggerAddress: '192.168.1.1:9333' }),
      }),
    }));
  });

  it('registers session in state with isAttached: true', async () => {
    await callTool();
    const state = (getBrowser as any).__state;
    expect(state.currentSession).toBe('attached-session-id');
    expect(state.sessionMetadata.get('attached-session-id')).toMatchObject({
      type: 'browser',
      isAttached: true,
    });
  });

  it('returns session id, title and url', async () => {
    const result = await callTool();
    const text = result.content[0].text;
    expect(text).toContain('attached-session-id');
    expect(text).toContain('My App');
    expect(text).toContain('https://example.com');
  });

  it('navigates to navigationUrl if provided', async () => {
    await callTool({ navigationUrl: 'https://app.example.com' });
    expect(mockBrowser.url).toHaveBeenCalledWith('https://app.example.com');
    expect(mockBrowser.switchToWindow).not.toHaveBeenCalled();
  });

  it('switches to the active tab (from /json) when no navigationUrl', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { type: 'page', url: 'https://active.example.com', title: 'Active', id: 't1' },
        { type: 'page', url: 'https://other.example.com', title: 'Other', id: 't2' },
      ]),
    }));
    mockBrowser.getWindowHandles.mockResolvedValue(['handle-1', 'handle-2']);
    mockBrowser.getUrl
      .mockResolvedValueOnce('https://other.example.com')  // handle-1
      .mockResolvedValueOnce('https://active.example.com') // handle-2 — match
      .mockResolvedValue('https://active.example.com');    // subsequent calls

    await callTool();

    expect(mockBrowser.switchToWindow).toHaveBeenCalledWith('handle-1');
    expect(mockBrowser.switchToWindow).toHaveBeenCalledWith('handle-2');
    expect(mockBrowser.url).not.toHaveBeenCalled();
  });

  it('restores single blanked tab when remote() blanks it during session init', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { type: 'page', url: 'https://active.example.com', title: 'Active', id: 't1' },
      ]),
    }));
    mockBrowser.getWindowHandles.mockResolvedValue(['handle-1']);
    mockBrowser.getUrl
      .mockResolvedValueOnce('about:blank')          // scan: handle-1 blanked
      .mockResolvedValue('https://active.example.com'); // final getUrl for result

    await callTool();

    expect(mockBrowser.url).toHaveBeenCalledWith('https://active.example.com');
    expect(mockBrowser.switchToWindow).toHaveBeenCalledWith('handle-1');
  });

  it('restores blanked first tab and switches to it when multiple tabs exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { type: 'page', url: 'https://active.example.com', title: 'Active', id: 't1' },
        { type: 'page', url: 'https://other.example.com', title: 'Other', id: 't2' },
      ]),
    }));
    mockBrowser.getWindowHandles.mockResolvedValue(['handle-1', 'handle-2']);
    mockBrowser.getUrl
      .mockResolvedValueOnce('about:blank')               // scan: handle-1 blanked by CDP
      .mockResolvedValueOnce('https://other.example.com') // scan: handle-2 intact
      .mockResolvedValue('https://active.example.com');   // final getUrl for result

    await callTool();

    // Restores handle-1 to the active URL
    expect(mockBrowser.url).toHaveBeenCalledWith('https://active.example.com');
    // Switches to handle-1 (originally active tab, now restored)
    const calls = mockBrowser.switchToWindow.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls[calls.length - 1]).toBe('handle-1');
  });

  it('initialises sessionHistory with constructed caps and empty steps', async () => {
    await callTool({ host: 'myhost', port: 9333 });
    const state = (getBrowser as any).__state;
    const history = state.sessionHistory.get('attached-session-id');
    expect(history).toBeDefined();
    expect(history.steps).toEqual([]);
    expect(history.capabilities).toMatchObject({
      browserName: 'chrome',
      'goog:chromeOptions': { debuggerAddress: 'myhost:9333' },
    });
  });

  it('returns error text when remote() throws', async () => {
    mockRemote.mockRejectedValue(new Error('Connection refused'));
    const result = await callTool({ port: 9999 });
    expect(result.content[0].text).toMatch(/Error/);
    expect(result.content[0].text).toContain('Connection refused');
  });
});
