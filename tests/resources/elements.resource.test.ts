import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot } from '@wdio/elements';
import { getBrowser, isUi5Session } from '../../src/session/state';
import { elementsResource } from '../../src/resources/elements.resource';
import type { StaticResourceDefinition } from '../../src/types/resource';
import { SNAPSHOT_MAX_CHARS } from '../../src/utils/snapshot-text';
import { ensureUi5Injected } from '../../src/ui5/runtime';
import { getUi5Controls } from '../../src/scripts/get-ui5-controls';

vi.mock('@wdio/elements', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
  isUi5Session: vi.fn(() => false),
}));

vi.mock('../../src/ui5/runtime', () => ({
  ensureUi5Injected: vi.fn(),
}));

vi.mock('../../src/scripts/get-ui5-controls', () => ({
  getUi5Controls: vi.fn(),
}));

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;
const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;
const mockIsUi5Session = isUi5Session as ReturnType<typeof vi.fn>;
const mockGetUi5Controls = getUi5Controls as ReturnType<typeof vi.fn>;
const handler = (elementsResource as StaticResourceDefinition).handler;

const uri = 'wdio://session/current/elements';
const snapshotText = '[Page: Login — https://example.com]\n  e1  button "Save"  →  #save';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBrowser.mockReturnValue({});
  mockIsUi5Session.mockReturnValue(false);
});

describe('elements resource', () => {
  it('returns the snapshot text verbatim as text/plain', async () => {
    mockGetSnapshot.mockResolvedValue({ format: 'legacy', text: snapshotText, elements: {} });

    const result = await handler();

    expect(result).toEqual({ contents: [{ uri, mimeType: 'text/plain', text: snapshotText }] });
  });

  it('passes inViewportOnly: true to getSnapshot', async () => {
    mockGetSnapshot.mockResolvedValue({ format: 'legacy', text: snapshotText, elements: {} });

    await handler();

    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: true });
  });

  it('applies the snapshot cap to oversized text', async () => {
    mockGetSnapshot.mockResolvedValue({ format: 'legacy', text: 'x'.repeat(SNAPSHOT_MAX_CHARS + 1), elements: {} });

    const result = await handler();
    const [content] = result.contents as { text: string }[];

    expect(content.text.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
    expect(content.text).toContain('… truncated: showing');
  });

  it('returns an error text when getSnapshot fails', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('browser disconnected'));

    const result = await handler();
    const [content] = result.contents as { text: string }[];

    expect(content.text).toContain('Error getting elements');
    expect(content.text).toContain('browser disconnected');
  });
});

describe('elements resource on UI5 sessions', () => {
  beforeEach(() => {
    mockIsUi5Session.mockReturnValue(true);
    mockGetUi5Controls.mockResolvedValue([{ tagName: 'sap.m.Button', name: 'save', type: '', value: '', href: '', selector: 'ui5:{}', isInViewport: true }]);
  });

  it('lists viewport UI5 controls instead of the snapshot', async () => {
    const result = await handler();
    const [content] = result.contents as { text: string }[];

    expect(ensureUi5Injected).toHaveBeenCalled();
    expect(mockGetUi5Controls).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: true });
    expect(mockGetSnapshot).not.toHaveBeenCalled();
    expect(content.text).toContain('sap.m.Button');
  });
});
