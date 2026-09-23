import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getElements } from '../../src/scripts/get-elements';
import { getBrowser } from '../../src/session/state';
import { getElementsTool } from '../../src/tools/get-elements.tool';

vi.mock('../../src/scripts/get-elements', () => ({
  getElements: vi.fn(),
}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    browsers: new Map(),
    currentSession: null as string | null,
    sessionMetadata: new Map<string, Record<string, unknown>>(),
    sessionHistory: new Map(),
  },
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
  getState: vi.fn(() => mockState),
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
  mockState.browsers.clear();
  mockState.sessionMetadata.clear();
  mockState.sessionHistory.clear();
  mockState.currentSession = null;
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

  it('passes ui5 false when the current session is not a UI5 session', async () => {
    await callTool({});
    expect(mockGetVisible).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ui5: false })
    );
  });

  it('passes ui5 true when the current session runtime is ui5', async () => {
    mockState.currentSession = 's1';
    mockState.sessionMetadata.set('s1', { runtime: 'ui5' });

    await callTool({});

    expect(mockGetVisible).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ui5: true })
    );
  });
});
