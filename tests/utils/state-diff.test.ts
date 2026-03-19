import { describe, it, expect, vi } from 'vitest';
import { captureStateDelta } from '../../src/utils/state-diff';

function makeBrowser() {
  return {
    execute: vi.fn().mockResolvedValue({ url: 'https://example.com', title: 'Test' }),
  } as unknown as WebdriverIO.Browser;
}

describe('captureStateDelta', () => {
  it('detects appeared elements', async () => {
    const browser = makeBrowser();
    const before = [{ selector: '#old', text: 'Old' }];
    const after = [{ selector: '#old', text: 'Old' }, { selector: '#new', text: 'New' }];
    const delta = await captureStateDelta(browser, before, after);
    expect(delta.appeared).toContain('#new');
    expect(delta.disappeared).toHaveLength(0);
  });

  it('detects disappeared elements', async () => {
    const browser = makeBrowser();
    const before = [{ selector: '#gone', text: 'Gone' }, { selector: '#stays', text: 'Stays' }];
    const after = [{ selector: '#stays', text: 'Stays' }];
    const delta = await captureStateDelta(browser, before, after);
    expect(delta.disappeared).toContain('#gone');
    expect(delta.appeared).toHaveLength(0);
  });

  it('detects changed element text', async () => {
    const browser = makeBrowser();
    const before = [{ selector: '#el', text: 'before' }];
    const after = [{ selector: '#el', text: 'after' }];
    const delta = await captureStateDelta(browser, before, after);
    expect(delta.changed).toContain('#el');
  });

  it('returns empty delta when nothing changed', async () => {
    const browser = makeBrowser();
    const elems = [{ selector: '#x', text: 'same' }];
    const delta = await captureStateDelta(browser, elems, [...elems]);
    expect(delta.appeared).toHaveLength(0);
    expect(delta.disappeared).toHaveLength(0);
    expect(delta.changed).toHaveLength(0);
  });

  it('reports urlChanged when URL changes', async () => {
    const browser = {
      execute: vi.fn().mockResolvedValue({ url: 'https://new.com', title: 'New' }),
    } as unknown as WebdriverIO.Browser;
    const delta = await captureStateDelta(browser, [], [], 'https://old.com', 'Old');
    expect(delta.urlChanged).toBe('https://new.com');
    expect(delta.titleChanged).toBe('New');
  });

  it('omits urlChanged when URL is the same', async () => {
    const browser = {
      execute: vi.fn().mockResolvedValue({ url: 'https://same.com', title: 'Same' }),
    } as unknown as WebdriverIO.Browser;
    const delta = await captureStateDelta(browser, [], [], 'https://same.com', 'Same');
    expect(delta.urlChanged).toBeUndefined();
    expect(delta.titleChanged).toBeUndefined();
  });
});
