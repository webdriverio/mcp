import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInteractableBrowserElements } from '../../src/scripts/get-interactable-browser-elements';
import { getMobileVisibleElements } from '../../src/scripts/get-visible-mobile-elements';
import { getElements } from '../../src/scripts/get-elements';

vi.mock('../../src/scripts/get-interactable-browser-elements', () => ({
  getInteractableBrowserElements: vi.fn(),
}));

vi.mock('../../src/scripts/get-visible-mobile-elements', () => ({
  getMobileVisibleElements: vi.fn(),
}));

const mockGetElements = getInteractableBrowserElements as ReturnType<typeof vi.fn>;
const mockGetMobile = getMobileVisibleElements as ReturnType<typeof vi.fn>;

function makeEl(name: string, inViewport = true) {
  return { name, selector: `#${name}`, tag: 'button', isInViewport: inViewport };
}

const browserMock = { isAndroid: false, isIOS: false } as unknown as WebdriverIO.Browser;
const androidMock = { isAndroid: true, isIOS: false } as unknown as WebdriverIO.Browser;

beforeEach(() => vi.clearAllMocks());

describe('getElements', () => {
  it('filters to viewport-only elements by default', async () => {
    mockGetElements.mockResolvedValue([makeEl('a', true), makeEl('b', false)]);
    const result = await getElements(browserMock, {});
    expect(result.total).toBe(1);
    expect(result.elements).toHaveLength(1);
  });

  it('returns all elements when inViewportOnly is false', async () => {
    mockGetElements.mockResolvedValue([makeEl('a', true), makeEl('b', false)]);
    const result = await getElements(browserMock, { inViewportOnly: false });
    expect(result.total).toBe(2);
  });

  it('applies limit and offset', async () => {
    mockGetElements.mockResolvedValue([makeEl('a'), makeEl('b'), makeEl('c')]);
    const result = await getElements(browserMock, { limit: 2, offset: 1 });
    expect(result.showing).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.elements[0]).toMatchObject({ name: 'b' });
  });

  it('reports hasMore correctly when more elements remain', async () => {
    mockGetElements.mockResolvedValue([makeEl('a'), makeEl('b'), makeEl('c')]);
    const result = await getElements(browserMock, { limit: 1, offset: 0 });
    expect(result.hasMore).toBe(true);
  });

  it('delegates to getMobileVisibleElements on Android', async () => {
    mockGetMobile.mockResolvedValue([makeEl('btn')]);
    await getElements(androidMock, {});
    expect(mockGetMobile).toHaveBeenCalledWith(androidMock, 'android', expect.any(Object));
    expect(mockGetElements).not.toHaveBeenCalled();
  });
});
