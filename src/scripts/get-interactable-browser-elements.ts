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

  function getSelector(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();

    // 1. tag*=Text — best per WebdriverIO docs
    const text = element.textContent?.trim().replace(/\s+/g, ' ');
    if (text && text.length > 0 && text.length <= 50) {
      const sameTagElements = document.querySelectorAll(tag);
      let matchCount = 0;
      sameTagElements.forEach(el => {
        if (el.textContent?.includes(text)) matchCount++;
      });
      if (matchCount === 1) return `${tag}*=${text}`;
    }

    // 2. aria/label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length <= 80) return `aria/${ariaLabel}`;

    // 3. data-testid
    const testId = element.getAttribute('data-testid');
    if (testId) {
      const sel = `[data-testid="${CSS.escape(testId)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 4. #id
    if (element.id) return `#${CSS.escape(element.id)}`;

    // 5. [name] — form elements
    const nameAttr = element.getAttribute('name');
    if (nameAttr) {
      const sel = `${tag}[name="${CSS.escape(nameAttr)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 6. tag.class — try each class individually, then first-two combination
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        const sel = `${tag}.${CSS.escape(cls)}`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
      if (classes.length >= 2) {
        const sel = `${tag}${classes.slice(0, 2).map(c => `.${CSS.escape(c)}`).join('')}`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }

    // 7. CSS path fallback
    let current: HTMLElement | null = element;
    const path: string[] = [];
    while (current && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id) {
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
