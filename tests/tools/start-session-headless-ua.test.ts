import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remote } from 'webdriverio';
import { registerSession } from '../../src/session/lifecycle';
import { createStartSessionTool, parseNetworkLogsMode, startSessionTool } from '../../src/tools/session.tool';

vi.mock('webdriverio', () => ({ remote: vi.fn() }));
vi.mock('../../src/session/lifecycle', () => ({ registerSession: vi.fn() }));
vi.mock('../../src/session/state', () => ({
  getState: vi.fn(() => ({ browsers: new Map(), currentSession: null, sessionMetadata: new Map(), sessionHistory: new Map() })),
}));

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const callTool = startSessionTool as unknown as ToolFn;
const mockRemote = remote as ReturnType<typeof vi.fn>;
const mockRegisterSession = registerSession as ReturnType<typeof vi.fn>;

const headlessBrowser = (execute: () => Promise<unknown>) => ({
  sessionId: 'local-1',
  capabilities: { browserName: 'chrome' },
  isBidi: true,
  setWindowSize: vi.fn(),
  execute,
  emulationSetUserAgentOverride: vi.fn(),
});

beforeEach(() => vi.clearAllMocks());

describe('start_session headless user agent', () => {
  it('warns and notes the reason when the override fails, and still starts', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRemote.mockResolvedValue(headlessBrowser(() => Promise.reject(new Error('bidi script failed'))));
    const result = await callTool({ platform: 'browser', provider: 'local', browser: 'chrome', headless: true });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Headless user agent not overridden: bidi script failed');
    expect(warn).toHaveBeenCalledWith('[WARN] Headless user agent not overridden: bidi script failed');
    warn.mockRestore();
  });

  it('adds no note when the override works', async () => {
    mockRemote.mockResolvedValue(headlessBrowser(() => Promise.resolve('Mozilla/5.0 Chrome/1.0')));
    const result = await callTool({ platform: 'browser', provider: 'local', browser: 'chrome', headless: true });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toContain('user agent');
  });
});

describe('start_session networkLogs', () => {
  it('parses WDIO_MCP_NETWORK_LOGS values case-insensitively with default none and throws on invalid values', () => {
    expect(parseNetworkLogsMode(undefined)).toBe('none');
    expect(parseNetworkLogsMode('')).toBe('none');
    expect(parseNetworkLogsMode('none')).toBe('none');
    expect(parseNetworkLogsMode('NONE')).toBe('none');
    expect(parseNetworkLogsMode('failures')).toBe('failures');
    expect(parseNetworkLogsMode('FAILURES')).toBe('failures');
    expect(parseNetworkLogsMode('all')).toBe('all');
    expect(parseNetworkLogsMode('All')).toBe('all');
    expect(() => parseNetworkLogsMode('failure')).toThrow(
      'Invalid WDIO_MCP_NETWORK_LOGS value "failure". Accepted values: none, failures, all.',
    );
  });

  it('uses the server env default when per-session networkLogs is omitted', async () => {
    mockRemote.mockResolvedValue(headlessBrowser(() => Promise.resolve('Mozilla/5.0 Chrome/1.0')));
    const startWithFailuresDefault = createStartSessionTool('failures') as unknown as ToolFn;

    const result = await startWithFailuresDefault({ platform: 'browser', provider: 'local', browser: 'chrome', headless: false });

    expect(result.content[0].text).not.toContain('networkLogs is only supported');
    expect(mockRemote).toHaveBeenCalledWith(expect.objectContaining({
      capabilities: expect.objectContaining({
        'goog:loggingPrefs': { performance: 'ALL' },
      }),
    }));
    expect(mockRegisterSession).toHaveBeenCalledWith(
      'local-1',
      expect.anything(),
      expect.objectContaining({ networkLogs: 'failures' }),
      expect.anything(),
      { keep: false, name: undefined },
    );
  });

  it('lets the per-session networkLogs override the env default', async () => {
    mockRemote.mockResolvedValue(headlessBrowser(() => Promise.resolve('Mozilla/5.0 Chrome/1.0')));
    const startWithAllDefault = createStartSessionTool('all') as unknown as ToolFn;

    await startWithAllDefault({
      platform: 'browser',
      provider: 'local',
      browser: 'chrome',
      headless: false,
      networkLogs: 'none',
    });

    const passedCapabilities = mockRemote.mock.calls[0][0].capabilities as Record<string, unknown>;
    expect(passedCapabilities['goog:loggingPrefs']).toBeUndefined();
    expect(mockRegisterSession).toHaveBeenCalledWith(
      'local-1',
      expect.anything(),
      expect.objectContaining({ networkLogs: 'none' }),
      expect.anything(),
      { keep: false, name: undefined },
    );
  });

  it('adds a note when networkLogs is enabled on Firefox, Safari, or a non-local provider', async () => {
    mockRemote.mockResolvedValue(headlessBrowser(() => Promise.resolve('Mozilla/5.0 Firefox/1.0')));

    const firefoxResult = await callTool({
      platform: 'browser',
      provider: 'local',
      browser: 'firefox',
      headless: true,
      networkLogs: 'failures',
    });
    expect(firefoxResult.content[0].text).toContain(
      'Note: networkLogs is only supported for local Chrome and Edge sessions and has no effect for this session.',
    );

    const externalResult = await callTool({
      platform: 'browser',
      provider: 'external',
      browser: 'chrome',
      networkLogs: 'all',
    });
    expect(externalResult.content[0].text).toContain(
      'Note: networkLogs is only supported for local Chrome and Edge sessions and has no effect for this session.',
    );
  });
});
