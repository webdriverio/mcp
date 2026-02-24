import { beforeEach, describe, expect, it } from 'vitest';
import { getInteractableBrowserElements } from '../../src/scripts/get-interactable-browser-elements';

const mockBrowser = {
  execute: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
} as unknown as WebdriverIO.Browser;

beforeEach(() => {
  HTMLElement.prototype.checkVisibility = () => true;
  document.body.innerHTML = '';
});

describe('element detection', () => {
  it.each([
    ['<button>Click</button>', 'button'],
    ['<a href="/page">Link</a>', 'a'],
    ['<input type="text">', 'input'],
    ['<input type="checkbox">', 'input'],
    ['<select><option>A</option></select>', 'select'],
    ['<textarea>text</textarea>', 'textarea'],
    ['<div role="button">Custom</div>', 'div'],
    ['<span role="checkbox" aria-checked="false">Check</span>', 'span'],
  ])('%s is returned', async (html, expectedTag) => {
    document.body.innerHTML = html;
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements.some(e => e.tagName === expectedTag)).toBe(true);
  });

  it('does not return hidden inputs', async () => {
    document.body.innerHTML = '<input type="hidden" value="secret">';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements).toHaveLength(0);
  });

  it('does not return invisible elements', async () => {
    HTMLElement.prototype.checkVisibility = () => false;
    document.body.innerHTML = '<button>Hidden</button>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements).toHaveLength(0);
  });

  it('deduplicates elements matched by multiple selectors', async () => {
    document.body.innerHTML = '<button tabindex="0">Click</button>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    // matches both 'button' and '[tabindex]:not([tabindex="-1"])' — should appear once
    const buttons = elements.filter(e => e.tagName === 'button');
    expect(buttons).toHaveLength(1);
  });
});

describe('field values', () => {
  it('returns all required fields', async () => {
    document.body.innerHTML = '<button>Click</button>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    const el = elements[0];
    expect(el).toHaveProperty('tagName');
    expect(el).toHaveProperty('name');
    expect(el).toHaveProperty('type');
    expect(el).toHaveProperty('value');
    expect(el).toHaveProperty('href');
    expect(el).toHaveProperty('selector');
    expect(el).toHaveProperty('isInViewport');
  });

  it('populates href for links', async () => {
    document.body.innerHTML = '<a href="/about">About</a>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].href).toBe('/about');
  });

  it('populates type for inputs', async () => {
    document.body.innerHTML = '<input type="email" placeholder="Email">';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].type).toBe('email');
  });

  it('includes boundingBox when includeBounds is true', async () => {
    document.body.innerHTML = '<button>Click</button>';
    const elements = await getInteractableBrowserElements(mockBrowser, { includeBounds: true });
    expect(elements[0]).toHaveProperty('boundingBox');
    expect(elements[0].boundingBox).toMatchObject({ x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) });
  });

  it('omits boundingBox by default', async () => {
    document.body.innerHTML = '<button>Click</button>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0]).not.toHaveProperty('boundingBox');
  });
});

describe('accessible name', () => {
  it('uses aria-label', async () => {
    document.body.innerHTML = '<button aria-label="Close">X</button>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].name).toBe('Close');
  });

  it('uses label[for] for inputs', async () => {
    document.body.innerHTML = `
      <label for="q">Search</label>
      <input id="q" type="search">
    `;
    const elements = await getInteractableBrowserElements(mockBrowser);
    const input = elements.find(e => e.tagName === 'input');
    expect(input?.name).toBe('Search');
  });

  it('uses placeholder as fallback', async () => {
    document.body.innerHTML = '<input type="text" placeholder="Enter name">';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].name).toBe('Enter name');
  });

  it('uses text content for buttons', async () => {
    document.body.innerHTML = '<button>Add to basket</button>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].name).toBe('Add to basket');
  });
});

describe('selector generation', () => {
  it('uses unique text content', async () => {
    document.body.innerHTML = '<button>Submit form</button>';
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].selector).toBe('button*=Submit form');
  });

  it('uses aria-label selector when text is not unique', async () => {
    document.body.innerHTML = `
      <button aria-label="Add Yellowface">Add to basket</button>
      <button aria-label="Add Normal People">Add to basket</button>
    `;
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].selector).toBe('aria/Add Yellowface');
    expect(elements[1].selector).toBe('aria/Add Normal People');
  });

  it('uses id selector', async () => {
    document.body.innerHTML = `
      <button id="btn-a">Click</button>
      <button id="btn-b">Click</button>
    `;
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].selector).toBe('#btn-a');
    expect(elements[1].selector).toBe('#btn-b');
  });

  it('uses unique class selector before CSS path', async () => {
    document.body.innerHTML = `
      <button class="product_111">Add to basket</button>
      <button class="product_222">Add to basket</button>
    `;
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].selector).toBe('button.product_111');
    expect(elements[1].selector).toBe('button.product_222');
  });

  it('falls back to CSS path when class is not unique', async () => {
    document.body.innerHTML = `
      <div><button class="btn">Add to basket</button></div>
      <div><button class="btn">Add to basket</button></div>
    `;
    const elements = await getInteractableBrowserElements(mockBrowser);
    expect(elements[0].selector).not.toBe('button.btn');
    expect(elements[0].selector).not.toBe('button*=Add to basket');
  });
});
