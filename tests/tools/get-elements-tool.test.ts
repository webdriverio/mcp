import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot } from '@wdio/elements';
import { getBrowser } from '../../src/session/state';
import { getElementsTool } from '../../src/tools/get-elements.tool';
import { SNAPSHOT_MAX_CHARS } from '../../src/utils/snapshot-text';

vi.mock('@wdio/elements', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
  getState: vi.fn(() => ({
    browsers: new Map(),
    currentSession: null,
    sessionMetadata: new Map(),
    sessionHistory: new Map(),
  })),
}));

type ToolFn = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean
}>;
const callTool = getElementsTool as unknown as ToolFn;

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;
const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;

const snapshotText = '[Page: Login — https://example.com]\n  e1  button "Save"  →  #save';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBrowser.mockReturnValue({ isAndroid: false, isIOS: false });
  mockGetSnapshot.mockResolvedValue({ format: 'legacy', text: snapshotText, elements: {} });
});

describe('get_elements tool', () => {
  it('forwards inViewportOnly to getSnapshot', async () => {
    await callTool({ inViewportOnly: true });
    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: true });
  });

  it('covers the whole page when inViewportOnly is omitted', async () => {
    await callTool({});
    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: false });
  });

  it('returns the snapshot text verbatim', async () => {
    const result = await callTool({});
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: snapshotText }]);
  });

  it('applies the snapshot cap to oversized text', async () => {
    const text = 'x'.repeat(SNAPSHOT_MAX_CHARS + 1);
    mockGetSnapshot.mockResolvedValue({ format: 'legacy', text, elements: {} });
    const result = await callTool({});
    expect(result.content[0].text.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
    expect(result.content[0].text).toContain('… truncated: showing');
  });

  it('returns isError true on failure', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('browser disconnected'));
    const result = await callTool({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('browser disconnected');
  });
});
