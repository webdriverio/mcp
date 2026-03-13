import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub fetch so getActiveTabUrl doesn't make real network requests
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  json: vi.fn().mockResolvedValue([{ type: 'page', url: 'https://example.com' }]),
}));

const mockBrowser = vi.hoisted(() => ({
  sessionId: 'attached-session-id',
  capabilities: {},
  getTitle: vi.fn().mockResolvedValue('My App'),
  url: vi.fn().mockResolvedValue(undefined),
  getUrl: vi.fn().mockResolvedValue('https://example.com'),
}));

vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue(mockBrowser),
}));

vi.mock('../../src/tools/browser.tool', () => {
  const state = {
    browsers: new Map(),
    currentSession: null as string | null,
    sessionMetadata: new Map(),
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
const callTool = attachBrowserTool as unknown as ToolFn;

const mockRemote = remote as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  const state = (getBrowser as any).__state;
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.currentSession = null;
  mockRemote.mockResolvedValue(mockBrowser);
});

describe('attach_browser', () => {
  it('calls remote() with debuggerAddress using default port 9222', async () => {
    await callTool({});
    expect(mockRemote).toHaveBeenCalledWith({
      capabilities: expect.objectContaining({
        browserName: 'chrome',
        'goog:chromeOptions': { debuggerAddress: 'localhost:9222', args: ['--user-data-dir=/tmp/chrome-debug'] },
      }),
    });
  });

  it('uses provided host and port', async () => {
    await callTool({ host: '192.168.1.1', port: 9333 });
    expect(mockRemote).toHaveBeenCalledWith({
      capabilities: expect.objectContaining({
        'goog:chromeOptions': expect.objectContaining({ debuggerAddress: '192.168.1.1:9333' }),
      }),
    });
  });

  it('uses provided userDataDir', async () => {
    await callTool({ userDataDir: '/custom/profile' });
    expect(mockRemote).toHaveBeenCalledWith({
      capabilities: expect.objectContaining({
        'goog:chromeOptions': expect.objectContaining({ args: ['--user-data-dir=/custom/profile'] }),
      }),
    });
  });

  it('registers session in state with isAttached: true', async () => {
    await callTool({});
    const state = (getBrowser as any).__state;
    expect(state.currentSession).toBe('attached-session-id');
    expect(state.sessionMetadata.get('attached-session-id')).toMatchObject({
      type: 'browser',
      isAttached: true,
    });
  });

  it('returns session id, title and url', async () => {
    const result = await callTool({});
    const text = result.content[0].text;
    expect(text).toContain('attached-session-id');
    expect(text).toContain('My App');
    expect(text).toContain('https://example.com');
  });

  it('navigates to navigationUrl if provided', async () => {
    await callTool({ navigationUrl: 'https://app.example.com' });
    expect(mockBrowser.url).toHaveBeenCalledWith('https://app.example.com');
  });

  it('returns error text when remote() throws', async () => {
    mockRemote.mockRejectedValue(new Error('Connection refused'));
    const result = await callTool({ port: 9999 });
    expect(result.content[0].text).toMatch(/Error/);
    expect(result.content[0].text).toContain('Connection refused');
  });
});
