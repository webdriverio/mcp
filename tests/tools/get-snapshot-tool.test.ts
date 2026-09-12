import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wdio/elements', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(() => ({
    isAndroid: false,
    isIOS: false,
    execute: vi.fn(async () => ({ readyState: 'complete', busy: 0 })),
  })),
  getState: vi.fn(() => ({ currentSession: 'session-1' })),
}));

import { getSnapshot } from '@wdio/elements';
import { getSnapshotTool } from '../../src/tools/get-snapshot.tool';

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;

type ToolFn = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;
const callTool = getSnapshotTool as unknown as ToolFn;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSnapshot.mockResolvedValue({
    text: '[Page: Home]\n  e1  button "Go"  →  //button[contains(., "Go")]',
    elements: { e1: { selector: '#go', tagName: 'button', role: 'button', text: 'Go' } },
  });
});

describe('get_snapshot tool', () => {
  it('returns the whole page by default, unlike the viewport-only resource', async () => {
    await callTool({});

    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: false });
  });

  it('honours an explicit inViewportOnly true', async () => {
    await callTool({ inViewportOnly: true });

    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: true });
  });

  it('returns the snapshot text with its footer', async () => {
    const result = await callTool({});

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('button "Go"');
    expect(result.content[0].text).toContain('on page');
  });

  it('returns isError true on failure', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('browser disconnected'));

    const result = await callTool({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('browser disconnected');
  });
});
