import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(),
}));

import { getBrowser } from '../../src/session/state';
import { readCookies } from '../../src/resources/cookies.resource';

const mockGetBrowser = getBrowser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readCookies', () => {
  it('reads the whole jar with a null source origin when no name is given', async () => {
    const getCookies = vi.fn().mockResolvedValue([{ name: 'a' }, { name: 'b' }]);
    mockGetBrowser.mockReturnValue({ getCookies });

    const result = await readCookies();

    expect(getCookies).toHaveBeenCalledWith(undefined, null);
    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify([{ name: 'a' }, { name: 'b' }]) });
  });

  it('reads a single cookie with a null source origin when a name is given', async () => {
    const getCookies = vi.fn().mockResolvedValue([{ name: 'x', value: '1' }]);
    mockGetBrowser.mockReturnValue({ getCookies });

    const result = await readCookies('x');

    expect(getCookies).toHaveBeenCalledWith({ name: 'x' }, null);
    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'x', value: '1' }) });
  });

  it('picks the same-named cookie whose domain matches the page host', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: 'other.com', value: 'a' },
      { name: 'sid', domain: '.example.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockResolvedValue('https://www.example.com/');
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: '.example.com', value: 'b' }) });
  });

  it('prefers a dotted domain over a host-only decoy listed first', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: 'example.com', value: 'a' },
      { name: 'sid', domain: '.example.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockResolvedValue('https://www.example.com/');
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: '.example.com', value: 'b' }) });
  });

  it('matches a host-only domain only on exact host equality', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: 'other.com', value: 'a' },
      { name: 'sid', domain: 'www.example.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockResolvedValue('https://www.example.com/');
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: 'www.example.com', value: 'b' }) });
  });

  it('rejects lookalike domains and falls back to the first cookie', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: '.notexample.com', value: 'a' },
      { name: 'sid', domain: 'notexample.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockResolvedValue('https://www.example.com/');
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: '.notexample.com', value: 'a' }) });
  });

  it('skips an empty-domain cookie in favor of a matching domain', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: '', value: 'a' },
      { name: 'sid', domain: '.example.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockResolvedValue('https://www.example.com/');
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: '.example.com', value: 'b' }) });
  });

  it('falls back to the first cookie when the page has no hostname', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: 'other.com', value: 'a' },
      { name: 'sid', domain: '.example.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockResolvedValue('about:blank');
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: 'other.com', value: 'a' }) });
  });

  it('falls back to the first cookie when no domain matches the page host', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: 'other.com', value: 'a' },
      { name: 'sid', domain: '.third.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockResolvedValue('https://www.example.com/');
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: 'other.com', value: 'a' }) });
  });

  it('falls back to the first same-named cookie when the page URL is unavailable', async () => {
    const getCookies = vi.fn().mockResolvedValue([
      { name: 'sid', domain: 'other.com', value: 'a' },
      { name: 'sid', domain: '.example.com', value: 'b' },
    ]);
    const getUrl = vi.fn().mockRejectedValue(new Error('no url'));
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    const result = await readCookies('sid');

    expect(result).toEqual({ mimeType: 'application/json', text: JSON.stringify({ name: 'sid', domain: 'other.com', value: 'a' }) });
  });

  it('does not query the page URL when the named cookie is unique', async () => {
    const getCookies = vi.fn().mockResolvedValue([{ name: 'sid', domain: 'other.com', value: 'a' }]);
    const getUrl = vi.fn();
    mockGetBrowser.mockReturnValue({ getCookies, getUrl });

    await readCookies('sid');

    expect(getUrl).not.toHaveBeenCalled();
  });

  it('returns null JSON when the named cookie is absent', async () => {
    mockGetBrowser.mockReturnValue({ getCookies: vi.fn().mockResolvedValue([]) });

    const result = await readCookies('missing');

    expect(result).toEqual({ mimeType: 'application/json', text: 'null' });
  });

  it('returns a text error when the browser call throws', async () => {
    mockGetBrowser.mockReturnValue({ getCookies: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await readCookies();

    expect(result).toEqual({ mimeType: 'text/plain', text: 'Error: Error: boom' });
  });
});
