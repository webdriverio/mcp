import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockState(sessionType: 'browser' | 'ios' | 'android' = 'browser') {
  const metadata = new Map();
  metadata.set('test-session', { type: sessionType });
  return {
    browsers: new Map(),
    currentSession: 'test-session',
    sessionMetadata: metadata,
    sessionHistory: new Map(),
  };
}

let mockState = createMockState();

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
  getState: vi.fn(() => mockState),
}));

import { getBrowser } from '../../src/session/state';
import { readSessionLogs } from '../../src/resources';

const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockState = createMockState();
});

// ─── Browser ──────────────────────────────────────────────────────────────────

describe('readSessionLogs — browser', () => {
  it('returns browser console log entries as JSON', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['browser', 'driver']),
      getLogs: vi.fn().mockResolvedValue([
        { level: 'SEVERE', message: 'Uncaught TypeError: x is not a function', timestamp: 1717000000000 },
        { level: 'WARNING', message: 'Deprecated API used', timestamp: 1717000001000 },
      ]),
    });

    const result = await readSessionLogs();
    expect(result.mimeType).toBe('application/json');

    const parsed = JSON.parse(result.text);
    expect(parsed.sessionType).toBe('browser');
    expect(parsed.logTypes).toEqual(['browser', 'driver']);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].level).toBe('SEVERE');
    expect(parsed.entries[0].message).toContain('Uncaught TypeError');
    expect(parsed.entries[0].timestamp).toBe(1717000000000);
    expect(parsed.entries[0].timestampISO).toBe(new Date(1717000000000).toISOString());
  });

  it('returns empty entries when no logs exist', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['browser']),
      getLogs: vi.fn().mockResolvedValue([]),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);
    expect(parsed.entries).toEqual([]);
  });
});

// ─── Android ──────────────────────────────────────────────────────────────────

describe('readSessionLogs — android', () => {
  beforeEach(() => {
    mockState = createMockState('android');
  });

  it('returns logcat entries', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['logcat', 'bugreport']),
      getLogs: vi.fn().mockResolvedValue([
        { level: 'FATAL', message: 'FATAL EXCEPTION: main\njava.lang.RuntimeException: ...', timestamp: 1717000000000 },
      ]),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);

    expect(parsed.sessionType).toBe('android');
    expect(parsed.logTypes).toContain('logcat');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].level).toBe('FATAL');
    expect(parsed.entries[0].message).toContain('FATAL EXCEPTION');
  });

  it('returns empty entries when logcat unavailable', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['bugreport']),
      getLogs: vi.fn(),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);
    expect(parsed.entries).toEqual([]);
    expect(parsed.logTypes).toEqual(['bugreport']);
  });
});

// ─── iOS ──────────────────────────────────────────────────────────────────────

describe('readSessionLogs — ios', () => {
  beforeEach(() => {
    mockState = createMockState('ios');
  });

  it('returns crashlog and syslog entries with source tags', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['crashlog', 'syslog']),
      getLogs: vi.fn()
        .mockResolvedValueOnce([{ level: 'CRASH', message: 'App crashed with signal SIGABRT', timestamp: 1717000000000 }])
        .mockResolvedValueOnce([{ level: 'WARNING', message: 'Memory pressure warning', timestamp: 1717000001000 }]),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);

    expect(parsed.sessionType).toBe('ios');
    expect(parsed.logTypes).toEqual(['crashlog', 'syslog']);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].level).toBe('CRASH');
    expect(parsed.entries[0].message).toContain('SIGABRT');
    expect(parsed.entries[0].source).toBe('crashlog');
    expect(parsed.entries[1].level).toBe('WARNING');
    expect(parsed.entries[1].message).toContain('Memory pressure');
    expect(parsed.entries[1].source).toBe('syslog');
  });

  it('skips unavailable log types gracefully', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['syslog']),
      getLogs: vi.fn().mockResolvedValue([
        { level: 'INFO', message: 'App launched', timestamp: 1717000000000 },
      ]),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].message).toContain('App launched');
  });

  it('continues when one log type throws during fetch', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['crashlog', 'syslog']),
      getLogs: vi.fn()
        .mockRejectedValueOnce(new Error('crashlog unavailable'))
        .mockResolvedValueOnce([{ level: 'INFO', message: 'System log entry', timestamp: 1717000000000 }]),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].message).toContain('System log entry');
    expect(parsed.entries[0].source).toBe('syslog');
  });

  it('does not throw all-failed when one type succeeds with empty entries while other throws', async () => {
    // crashlog succeeds but returns [] (no crashes), syslog throws
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['crashlog', 'syslog']),
      getLogs: vi.fn()
        .mockResolvedValueOnce([]) // crashlog: success, empty result
        .mockRejectedValueOnce(new Error('syslog unavailable')),
    });

    const result = await readSessionLogs();
    expect(result.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.text);
    expect(parsed.entries).toEqual([]);
    // Should NOT contain "All iOS log types failed" — one type succeeded
    expect(result.text).not.toContain('All iOS log types failed');
  });

  it('returns error when all available iOS log types throw', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['crashlog', 'syslog']),
      getLogs: vi.fn()
        .mockRejectedValueOnce(new Error('crashlog not accessible'))
        .mockRejectedValueOnce(new Error('syslog not accessible')),
    });

    const result = await readSessionLogs();
    expect(result.mimeType).toBe('text/plain');
    expect(result.text).toContain('All iOS log types failed');
    expect(result.text).toContain('crashlog not accessible');
    expect(result.text).toContain('syslog not accessible');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('readSessionLogs — error handling', () => {
  it('returns error when getLogTypes fails (unsupported)', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockRejectedValue(new Error('unknown command: not supported')),
      getLogs: vi.fn(),
    });

    const result = await readSessionLogs();
    expect(result.mimeType).toBe('text/plain');
    expect(result.text).toContain('Error');
    expect(result.text).toContain('not supported');
  });

  it('returns error when no active session', async () => {
    mockGetBrowser.mockImplementation(() => {
      throw new Error('No active browser session');
    });

    const result = await readSessionLogs();
    expect(result.text).toContain('No active browser session');
  });

  it('handles session with null sessionMetadata gracefully', async () => {
    mockState = {
      browsers: new Map(),
      currentSession: 'test-session',
      sessionMetadata: new Map(),
      sessionHistory: new Map(),
    };

    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['browser']),
      getLogs: vi.fn().mockResolvedValue([]),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);
    expect(parsed.sessionType).toBe('browser'); // default fallback
  });

  it('includes ISO timestamp for each entry', async () => {
    mockGetBrowser.mockReturnValue({
      getLogTypes: vi.fn().mockResolvedValue(['browser']),
      getLogs: vi.fn().mockResolvedValue([
        { level: 'SEVERE', message: 'error at epoch zero', timestamp: 0 },
      ]),
    });

    const result = await readSessionLogs();
    const parsed = JSON.parse(result.text);
    expect(parsed.entries[0].timestamp).toBe(0);
    expect(parsed.entries[0].timestampISO).toBe('1970-01-01T00:00:00.000Z');
  });
});
