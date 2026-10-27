/**
 * Browser element detection
 * Single browser.execute() call: querySelectorAll → flat interactable element list
 *
 * NOTE: This script runs in browser context via browser.execute()
 * It must be self-contained with no external dependencies
 */

export interface BrowserElementInfo {
  tagName: string;
  name: string;          // computed accessible name (ARIA spec)
  type: string;
  value: string;
  href: string;
  selector: string;
  isInViewport: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface GetBrowserElementsOptions {
  includeBounds?: boolean;
}

const elementsScript = (includeBounds: boolean) => (function () {
  const interactableSelectors = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="combobox"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="slider"]',
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="spinbutton"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function isVisible(element: HTMLElement): boolean {
    if (typeof element.checkVisibility === 'function') {
      return element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
    }
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0;
  }

  function getAccessibleName(el: HTMLElement): string {
    // 1. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 2. aria-labelledby — resolve referenced elements
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const texts = labelledBy.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim() || '')
        .filter(Boolean);
      if (texts.length > 0) return texts.join(' ').slice(0, 100);
    }

    const tag = el.tagName.toLowerCase();

    // 3. alt for images and input[type=image]
    if (tag === 'img' || (tag === 'input' && el.getAttribute('type') === 'image')) {
      const alt = el.getAttribute('alt');
      if (alt !== null) return alt.trim();
    }

    // 4. label[for=id] for form elements
    if (['input', 'select', 'textarea'].includes(tag)) {
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent?.trim() || '';
      }
      // 5. Wrapping label — clone, strip inputs, read text
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input,select,textarea').forEach(n => n.remove());
        const lt = clone.textContent?.trim();
        if (lt) return lt;
      }
    }

    // 6. placeholder
    const ph = el.getAttribute('placeholder');
    if (ph) return ph.trim();

    // 7. title
    const title = el.getAttribute('title');
    if (title) return title.trim();

    // 8. text content (truncated, whitespace normalized)
    return (el.textContent?.trim().replace(/\s+/g, ' ') || '').slice(0, 100);
  }

  function getRole(el: HTMLElement): string | null {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.split(' ')[0];

    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'button': return 'button';
      case 'a': return el.hasAttribute('href') ? 'link' : null;
      case 'input': {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'hidden') return null;
        if (type === 'checkbox' || type === 'radio') return type;
        if (type === 'range') return 'slider';
        if (type === 'search') return 'searchbox';
        if (type === 'number') return 'spinbutton';
        if (['submit', 'reset', 'button', 'image'].includes(type)) return 'button';
        return 'textbox';
      }
      case 'select': return 'combobox';
      case 'textarea': return 'textbox';
    }

    if ((el as HTMLElement & { contentEditable: string }).contentEditable === 'true') return 'textbox';
    return null;
  }

  function getSelectorAccessibleName(el: HTMLElement): string {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const texts = labelledBy.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim() || '')
        .filter(Boolean);
      if (texts.length > 0) return texts.join(' ').slice(0, 100);
    }

    const tag = el.tagName.toLowerCase();
    if (tag === 'img' || (tag === 'input' && el.getAttribute('type') === 'image')) {
      const alt = el.getAttribute('alt');
      if (alt !== null) return alt.trim();
    }

    if (['input', 'select', 'textarea'].includes(tag)) {
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent?.trim() || '';
      }
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input,select,textarea').forEach(n => n.remove());
        const lt = clone.textContent?.trim();
        if (lt) return lt;
      }
      return '';
    }

    return (el.textContent?.trim().replace(/\s+/g, ' ') || '').slice(0, 100);
  }

  function isLikelyGeneratedId(id: string): boolean {
    return /^[0-9a-f]{8,}$/i.test(id) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      /(?:^|[-_:])\d{8,}(?:$|[-_:])/.test(id) ||
      /^(?:ember|react-select|radix|headlessui|mui|mantine|chakra|auto|generated)[-_:]?\d+/i.test(id);
  }

  function uniqueCssSelector(selector: string): string | null {
    return document.querySelectorAll(selector).length === 1 ? selector : null;
  }

  function getSelector(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();

    // 1. Explicit test hooks
    for (const attr of ['data-testid', 'data-test', 'data-qa']) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const selector = uniqueCssSelector(`[${attr}="${CSS.escape(value)}"]`);
      if (selector) return selector;
    }

    // 2. Accessible name. WebdriverIO's aria/ selector is name-based, so only
    // emit it when the accessible-name candidate is unique among interactables.
    const role = getRole(element);
    const accessibleName = getSelectorAccessibleName(element);
    if (role && accessibleName && accessibleName.length <= 80) {
      let matchCount = 0;
      document.querySelectorAll(interactableSelectors).forEach(el => {
        const htmlEl = el as HTMLElement;
        if (isVisible(htmlEl) && getRole(htmlEl) && getSelectorAccessibleName(htmlEl) === accessibleName) matchCount++;
      });
      if (matchCount === 1) return `aria/${accessibleName}`;
    }

    // 3. Stable #id
    if (element.id && !isLikelyGeneratedId(element.id)) return `#${CSS.escape(element.id)}`;

    // 4. Stable input attributes
    const nameAttr = element.getAttribute('name');
    if (nameAttr) {
      const sel = `${tag}[name="${CSS.escape(nameAttr)}"]`;
      const selector = uniqueCssSelector(sel);
      if (selector) return selector;
    }

    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      const sel = `${tag}[placeholder="${CSS.escape(placeholder)}"]`;
      const selector = uniqueCssSelector(sel);
      if (selector) return selector;
    }

    // 5. Scoped CSS fallback — try classes before structural paths
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        const sel = `${tag}.${CSS.escape(cls)}`;
        const selector = uniqueCssSelector(sel);
        if (selector) return selector;
      }
      if (classes.length >= 2) {
        const sel = `${tag}${classes.slice(0, 2).map(c => `.${CSS.escape(c)}`).join('')}`;
        const selector = uniqueCssSelector(sel);
        if (selector) return selector;
      }
    }

    let current: HTMLElement | null = element;
    const path: string[] = [];
    while (current && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id && !isLikelyGeneratedId(current.id)) {
        path.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
        if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      path.unshift(seg);
      current = current.parentElement;
      if (path.length >= 4) break;
    }
    return path.join(' > ');
  }

  const elements: Record<string, unknown>[] = [];
  const seen = new Set<Element>();

  document.querySelectorAll(interactableSelectors).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);

    const htmlEl = el as HTMLElement;
    if (!isVisible(htmlEl)) return;

    const inputEl = htmlEl as HTMLInputElement;
    const rect = htmlEl.getBoundingClientRect();
    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );

    const entry: Record<string, unknown> = {
      tagName: htmlEl.tagName.toLowerCase(),
      name: getAccessibleName(htmlEl),
      type: htmlEl.getAttribute('type') || '',
      value: inputEl.value || '',
      href: htmlEl.getAttribute('href') || '',
      selector: getSelector(htmlEl),
      isInViewport,
    };

    if (includeBounds) {
      entry.boundingBox = {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    }

    elements.push(entry);
  });

  return elements;
})();

/**
 * Get interactable browser elements via querySelectorAll.
 */
export async function getInteractableBrowserElements(
  browser: WebdriverIO.Browser,
  options: GetBrowserElementsOptions = {},
): Promise<BrowserElementInfo[]> {
  const { includeBounds = false } = options;
  return (browser as any).execute(elementsScript, includeBounds) as unknown as Promise<BrowserElementInfo[]>;
}

export default elementsScript;
