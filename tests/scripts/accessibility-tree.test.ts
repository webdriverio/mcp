import { beforeEach, describe, expect, it } from 'vitest';
import { getBrowserAccessibilityTree } from '../../src/scripts/get-browser-accessibility-tree';

// Mock browser.execute(fn, ...args) → fn(...args) so the script runs in happy-dom
const mockBrowser = {
  execute: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
} as unknown as WebdriverIO.Browser;

beforeEach(() => {
  // happy-dom has no layout engine — patch checkVisibility so isVisible() returns true
  HTMLElement.prototype.checkVisibility = () => true;
  document.body.innerHTML = '';
});

describe('tree structure', () => {
  it('returns a flat list with no children field', async () => {
    document.body.innerHTML = '<nav aria-label="Main"><a href="/">Home</a></nav>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]).not.toHaveProperty('children');
  });

  it('skips roleless wrapper elements and recurses into their children', async () => {
    document.body.innerHTML = '<div><div><button>Click me</button></div></div>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].role).toBe('button');
  });

  it('preserves pre-order traversal', async () => {
    document.body.innerHTML = `
      <nav aria-label="Main">
        <a href="/a">First</a>
        <a href="/b">Second</a>
      </nav>
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].role).toBe('navigation');
    expect(nodes[1].name).toBe('First');
    expect(nodes[2].name).toBe('Second');
  });
});

describe('role detection', () => {
  it.each([
    ['<nav aria-label="x"></nav>', 'navigation'],
    ['<main aria-label="x"></main>', 'main'],
    ['<h1>Title</h1>', 'heading'],
    ['<button>Click</button>', 'button'],
    ['<a href="/">Link</a>', 'link'],
    ['<input type="text">', 'textbox'],
    ['<input type="checkbox">', 'checkbox'],
    ['<input type="radio">', 'radio'],
    ['<select><option>A</option></select>', 'combobox'],
    ['<textarea>text</textarea>', 'textbox'],
  ])('%s → %s', async (html, expectedRole) => {
    document.body.innerHTML = html;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes.some(n => n.role === expectedRole)).toBe(true);
  });

  it('does not include <a> without href', async () => {
    document.body.innerHTML = '<a>No href</a>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes).toHaveLength(0);
  });

  it('heading includes level', async () => {
    document.body.innerHTML = '<h2>Section</h2>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].level).toBe(2);
  });
});

describe('accessible name computation', () => {
  it('prefers aria-label', async () => {
    document.body.innerHTML = '<button aria-label="Close dialog">X</button>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].name).toBe('Close dialog');
  });

  it('resolves aria-labelledby', async () => {
    document.body.innerHTML = `
      <span id="lbl">Search books</span>
      <input type="text" aria-labelledby="lbl">
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    const input = nodes.find(n => n.role === 'textbox');
    expect(input?.name).toBe('Search books');
  });

  it('uses label[for] for inputs', async () => {
    document.body.innerHTML = `
      <label for="email">Email address</label>
      <input id="email" type="email">
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    const input = nodes.find(n => n.role === 'textbox');
    expect(input?.name).toBe('Email address');
  });

  it('falls back to placeholder', async () => {
    document.body.innerHTML = '<input type="text" placeholder="Search...">';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].name).toBe('Search...');
  });

  it('falls back to text content for buttons', async () => {
    document.body.innerHTML = '<button>Add to basket</button>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].name).toBe('Add to basket');
  });
});

describe('state fields', () => {
  it('always returns all state fields even when empty', async () => {
    document.body.innerHTML = '<button>Normal</button>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    const node = nodes[0];
    expect(node).toHaveProperty('disabled', '');
    expect(node).toHaveProperty('checked', '');
    expect(node).toHaveProperty('expanded', '');
    expect(node).toHaveProperty('selected', '');
    expect(node).toHaveProperty('pressed', '');
    expect(node).toHaveProperty('required', '');
    expect(node).toHaveProperty('readonly', '');
  });

  it('sets disabled for disabled elements', async () => {
    document.body.innerHTML = '<button disabled>Can\'t click</button>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].disabled).toBe('true');
  });

  it('sets checked for checked checkbox', async () => {
    document.body.innerHTML = '<input type="checkbox" checked>';
    // checkboxes with no name won't appear in the tree — give it a label
    document.body.innerHTML = `
      <label><input type="checkbox" checked> Accept terms</label>
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    const checkbox = nodes.find(n => n.role === 'checkbox');
    expect(checkbox?.checked).toBe('true');
  });

  it('sets expanded from aria-expanded', async () => {
    document.body.innerHTML = '<button aria-expanded="true">Menu</button>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].expanded).toBe('true');
  });

  it('level is empty string for non-headings', async () => {
    document.body.innerHTML = '<button>Click</button>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].level).toBe('');
  });
});

describe('selector generation', () => {
  it('uses unique text content selector', async () => {
    document.body.innerHTML = '<button>Add to Basket</button>';
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].selector).toBe('button*=Add to Basket');
  });

  it('uses aria label selector when text is not unique', async () => {
    // Both buttons have the same text "X" so text selector fails, aria-label wins
    document.body.innerHTML = `
      <button aria-label="Close dialog">X</button>
      <button aria-label="Close other">X</button>
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].selector).toBe('aria/Close dialog');
  });

  it('uses id selector', async () => {
    document.body.innerHTML = `
      <button id="submit-btn">Submit</button>
      <button id="cancel-btn">Submit</button>
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].selector).toBe('#submit-btn');
  });

  it('uses unique class selector before CSS path', async () => {
    document.body.innerHTML = `
      <button class="product_123">Add to basket</button>
      <button class="product_456">Add to basket</button>
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    expect(nodes[0].selector).toBe('button.product_123');
    expect(nodes[1].selector).toBe('button.product_456');
  });

  it('falls back to CSS path when class is not unique', async () => {
    document.body.innerHTML = `
      <div>
        <button class="btn">Add to basket</button>
      </div>
      <div>
        <button class="btn">Add to basket</button>
      </div>
    `;
    const nodes = await getBrowserAccessibilityTree(mockBrowser);
    // class "btn" is shared, text is shared — must fall back to structural path
    expect(nodes[0].selector).not.toBe('button.btn');
    expect(nodes[0].selector).not.toBe('button*=Add to basket');
  });
});
