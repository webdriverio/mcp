/**
 * Browser accessibility tree
 * Single browser.execute() call: DOM walk → flat accessibility node list
 *
 * NOTE: This script runs in browser context via browser.execute()
 * It must be self-contained with no external dependencies
 */

export interface AccessibilityNode {
  role: string;
  name: string;
  selector: string;
  level: number | string;
  disabled: string;
  checked: string;
  expanded: string;
  selected: string;
  pressed: string;
  required: string;
  readonly: string;
}

const accessibilityTreeScript = () => (function () {

  const INPUT_TYPE_ROLES: Record<string, string> = {
    text: 'textbox', search: 'searchbox', email: 'textbox', url: 'textbox',
    tel: 'textbox', password: 'textbox', number: 'spinbutton',
    checkbox: 'checkbox', radio: 'radio', range: 'slider',
    submit: 'button', reset: 'button', image: 'button', file: 'button', color: 'button',
  };

  const LANDMARK_ROLES = new Set([
    'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'form', 'dialog', 'region',
  ]);

  // Container roles: named only via aria-label/aria-labelledby, not textContent
  const CONTAINER_ROLES = new Set([
    'navigation', 'banner', 'contentinfo', 'complementary', 'main', 'form',
    'region', 'group', 'list', 'listitem', 'table', 'row', 'rowgroup', 'generic',
  ]);

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
        return INPUT_TYPE_ROLES[type] || 'textbox';
      }
      case 'select': return 'combobox';
      case 'textarea': return 'textbox';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
      case 'img': return 'img';
      case 'nav': return 'navigation';
      case 'main': return 'main';
      case 'header': return !el.closest('article,aside,main,nav,section') ? 'banner' : null;
      case 'footer': return !el.closest('article,aside,main,nav,section') ? 'contentinfo' : null;
      case 'aside': return 'complementary';
      case 'dialog': return 'dialog';
      case 'form': return 'form';
      case 'section': return (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) ? 'region' : null;
      case 'summary': return 'button';
      case 'details': return 'group';
      case 'progress': return 'progressbar';
      case 'meter': return 'meter';
      case 'ul': case 'ol': return 'list';
      case 'li': return 'listitem';
      case 'table': return 'table';
    }

    if ((el as HTMLElement & { contentEditable: string }).contentEditable === 'true') return 'textbox';
    if (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex') || '-1', 10) >= 0) return 'generic';

    return null;
  }

  function getAccessibleName(el: HTMLElement, role: string | null): string {
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
    }

    const ph = el.getAttribute('placeholder');
    if (ph) return ph.trim();

    const title = el.getAttribute('title');
    if (title) return title.trim();

    if (role && CONTAINER_ROLES.has(role)) return '';
    return (el.textContent?.trim().replace(/\s+/g, ' ') || '').slice(0, 100);
  }

  function getSelector(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();

    const text = element.textContent?.trim().replace(/\s+/g, ' ');
    if (text && text.length > 0 && text.length <= 50) {
      const sameTagElements = document.querySelectorAll(tag);
      let matchCount = 0;
      sameTagElements.forEach(el => { if (el.textContent?.includes(text)) matchCount++; });
      if (matchCount === 1) return `${tag}*=${text}`;
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length <= 80) return `aria/${ariaLabel}`;

    const testId = element.getAttribute('data-testid');
    if (testId) {
      const sel = `[data-testid="${CSS.escape(testId)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    if (element.id) return `#${CSS.escape(element.id)}`;

    const nameAttr = element.getAttribute('name');
    if (nameAttr) {
      const sel = `${tag}[name="${CSS.escape(nameAttr)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

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

    let current: HTMLElement | null = element;
    const path: string[] = [];
    while (current && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id) { path.unshift(`#${CSS.escape(current.id)}`); break; }
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

  function isVisible(el: HTMLElement): boolean {
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
    }
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0;
  }

  function getLevel(el: HTMLElement): number | undefined {
    const m = el.tagName.toLowerCase().match(/^h([1-6])$/);
    if (m) return parseInt(m[1], 10);
    const ariaLevel = el.getAttribute('aria-level');
    if (ariaLevel) return parseInt(ariaLevel, 10);
    return undefined;
  }

  function getState(el: HTMLElement): Record<string, string> {
    const inputEl = el as HTMLInputElement;
    const isCheckable = ['input', 'menuitemcheckbox', 'menuitemradio'].includes(el.tagName.toLowerCase()) ||
      ['checkbox', 'radio', 'switch'].includes(el.getAttribute('role') || '');
    return {
      disabled: (el.getAttribute('aria-disabled') === 'true' || inputEl.disabled) ? 'true' : '',
      checked: (isCheckable && inputEl.checked) ? 'true' : el.getAttribute('aria-checked') || '',
      expanded: el.getAttribute('aria-expanded') || '',
      selected: el.getAttribute('aria-selected') || '',
      pressed: el.getAttribute('aria-pressed') || '',
      required: (inputEl.required || el.getAttribute('aria-required') === 'true') ? 'true' : '',
      readonly: (inputEl.readOnly || el.getAttribute('aria-readonly') === 'true') ? 'true' : '',
    };
  }

  type RawNode = Record<string, unknown>;

  const result: RawNode[] = [];

  function walk(el: HTMLElement, depth = 0): void {
    if (depth > 200) return;
    if (!isVisible(el)) return;

    const role = getRole(el);

    if (!role) {
      for (const child of Array.from(el.children)) {
        walk(child as HTMLElement, depth + 1);
      }
      return;
    }

    const name = getAccessibleName(el, role);
    const isLandmark = LANDMARK_ROLES.has(role);
    const hasIdentity = !!(name || isLandmark);
    const selector = hasIdentity ? getSelector(el) : '';
    const node: RawNode = { role, name, selector, level: getLevel(el) ?? '', ...getState(el) };
    result.push(node);

    for (const child of Array.from(el.children)) {
      walk(child as HTMLElement, depth + 1);
    }
  }

  for (const child of Array.from(document.body.children)) {
    walk(child as HTMLElement, 0);
  }

  return result;
})();

/**
 * Get browser accessibility tree via a single DOM walk.
 */
export async function getBrowserAccessibilityTree(
  browser: WebdriverIO.Browser,
): Promise<AccessibilityNode[]> {
  return (browser as any).execute(accessibilityTreeScript) as unknown as Promise<AccessibilityNode[]>;
}
