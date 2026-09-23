import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot } from '@wdio/elements';
import { ensureUi5Injected } from '../../src/ui5/runtime';
import { getUi5Controls } from '../../src/scripts/get-ui5-controls';
import { getBrowser } from '../../src/session/state';
import { getElementsTool } from '../../src/tools/get-elements.tool';
import { SNAPSHOT_MAX_CHARS } from '../../src/utils/snapshot-text';

vi.mock('@wdio/elements', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../../src/ui5/runtime', () => ({
  ensureUi5Injected: vi.fn(),
}));

vi.mock('../../src/scripts/get-ui5-controls', () => ({
  getUi5Controls: vi.fn(),
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
  isUi5Session: vi.fn(() => mockState.sessionMetadata.get(mockState.currentSession ?? '')?.runtime === 'ui5'),
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
  mockState.browsers.clear();
  mockState.sessionMetadata.clear();
  mockState.sessionHistory.clear();
  mockState.currentSession = null;
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

describe('get_elements tool on UI5 sessions', () => {
  const mockEnsureUi5Injected = ensureUi5Injected as ReturnType<typeof vi.fn>;
  const mockGetUi5Controls = getUi5Controls as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockState.currentSession = 's1';
    mockState.sessionMetadata.set('s1', { runtime: 'ui5' });
    mockGetUi5Controls.mockResolvedValue([{ tagName: 'sap.m.Button', name: 'save', type: 'Button', value: '', href: '', selector: 'ui5:{}', isInViewport: true }]);
  });

  it('injects the UI5 bridge and lists controls instead of the snapshot', async () => {
    const result = await callTool({ includeBounds: true });
    expect(mockEnsureUi5Injected).toHaveBeenCalled();
    expect(mockGetUi5Controls).toHaveBeenCalledWith(expect.anything(), { includeBounds: true });
    expect(mockGetSnapshot).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('sap.m.Button');
  });
});
