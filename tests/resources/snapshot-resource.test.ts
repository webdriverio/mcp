import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wdio/elements', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(() => ({ isAndroid: false, isIOS: false })),
  getState: vi.fn(() => ({ currentSession: 'session-1' })),
}));

import { getSnapshot } from '@wdio/elements';
import { snapshotResource } from '../../src/resources/snapshot.resource';
import { resolveRef } from '../../src/session/element-refs';

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;

const handler = snapshotResource.handler as unknown as () => Promise<{
  contents: { uri: string; mimeType: string; text: string }[];
}>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSnapshot.mockResolvedValue({
    text: '[Page: Home]\n@e1 button "Go"',
    elements: { e1: { selector: '#go', tagName: 'button', role: 'button', text: 'Go' } },
  });
});

describe('snapshot resource', () => {
  it('requests a viewport-only snapshot and returns the text verbatim', async () => {
    const result = await handler();

    expect(mockGetSnapshot).toHaveBeenCalledWith(expect.anything(), { inViewportOnly: true });
    expect(result.contents[0].uri).toBe('wdio://session/current/snapshot');
    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toBe('[Page: Home]\n@e1 button "Go"');
  });

  it('stores the elements map so refs resolve afterwards', async () => {
    await handler();

    expect(resolveRef('e1')).toBe('#go');
  });

  it('reports errors as text', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('no session'));

    const result = await handler();

    expect(result.contents[0].text).toContain('no session');
  });
});
