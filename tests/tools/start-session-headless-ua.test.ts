import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remote } from 'webdriverio';
import { startSessionTool } from '../../src/tools/session.tool';

vi.mock('webdriverio', () => ({ remote: vi.fn() }));
vi.mock('../../src/session/lifecycle', () => ({ registerSession: vi.fn() }));
vi.mock('../../src/session/state', () => ({
  getState: vi.fn(() => ({ browsers: new Map(), currentSession: null, sessionMetadata: new Map(), sessionHistory: new Map() })),
}));

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const callTool = startSessionTool as unknown as ToolFn;
const mockRemote = remote as ReturnType<typeof vi.fn>;

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
