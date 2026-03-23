import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getElements } from '../../src/scripts/get-elements';
import { getBrowser } from '../../src/session/state';
import { getElementsTool } from '../../src/tools/get-elements.tool';

vi.mock('../../src/scripts/get-elements', () => ({
  getElements: vi.fn(),
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

const mockGetVisible = getElements as ReturnType<typeof vi.fn>;
const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;

const defaultResult = { total: 1, showing: 1, hasMore: false, elements: [{ name: 'btn', selector: '#btn' }] };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBrowser.mockReturnValue({ isAndroid: false, isIOS: false });
  mockGetVisible.mockResolvedValue(defaultResult);
});

describe('get_elements tool', () => {
  it('passes inViewportOnly false to getElements', async () => {
    await callTool({ inViewportOnly: false });
    expect(mockGetVisible).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inViewportOnly: false })
    );
  });

  it('returns toon-encoded text with element data', async () => {
    const result = await callTool({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('btn');
  });

  it('returns isError true on failure', async () => {
    mockGetVisible.mockRejectedValue(new Error('browser disconnected'));
    const result = await callTool({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('browser disconnected');
  });

  it('passes limit and offset to getElements', async () => {
    await callTool({ limit: 10, offset: 5 });
    expect(mockGetVisible).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 10, offset: 5 })
    );
  });
});
