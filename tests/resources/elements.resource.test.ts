import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot } from '@wdio/elements';
import { getBrowser } from '../../src/session/state';
import { elementsResource } from '../../src/resources/elements.resource';
import type { StaticResourceDefinition } from '../../src/types/resource';
import { SNAPSHOT_MAX_CHARS } from '../../src/utils/snapshot-text';

vi.mock('@wdio/elements', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
}));

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;
const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;
const handler = (elementsResource as StaticResourceDefinition).handler;

const uri = 'wdio://session/current/elements';
const snapshotText = '[Page: Login — https://example.com]\n  e1  button "Save"  →  #save';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBrowser.mockReturnValue({});
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
    expect(content.text).toContain('… truncated (');
  });

  it('returns an error text when getSnapshot fails', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('browser disconnected'));

    const result = await handler();
    const [content] = result.contents as { text: string }[];

    expect(content.text).toContain('Error getting elements');
    expect(content.text).toContain('browser disconnected');
  });
});
