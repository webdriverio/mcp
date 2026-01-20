/**
 * Browser script to get visible elements on the page
 * Supports interactable elements, visual elements, or both
 *
 * @param elementType - Type of elements to return: 'interactable', 'visual', or 'all'
 */
const elementsScript = (elementType: 'interactable' | 'visual' | 'all' = 'interactable') => (function () {
  const interactableSelectors = [
    'a[href]',                    // Links with href
    'button',                     // Buttons
    'input:not([type="hidden"])', // Input fields (except hidden)
    'select',                     // Select dropdowns
    'textarea',                   // Text areas
    '[role="button"]',            // Elements with button role
    '[role="link"]',              // Elements with link role
    '[role="checkbox"]',          // Elements with checkbox role
    '[role="radio"]',             // Elements with radio role
    '[role="tab"]',               // Elements with tab role
    '[role="menuitem"]',          // Elements with menuitem role
    '[role="combobox"]',          // Elements with combobox role
    '[role="option"]',            // Elements with option role
    '[role="switch"]',            // Elements with switch role
    '[role="slider"]',            // Elements with slider role
    '[role="textbox"]',           // Elements with textbox role
    '[role="searchbox"]',         // Elements with searchbox role
    '[contenteditable="true"]',   // Editable content
    '[tabindex]:not([tabindex="-1"])', // Elements with tabindex
  ];

  const visualSelectors = [
    'img',                        // Images
    'picture',                    // Picture elements
    'svg',                        // SVG graphics
    'video',                      // Video elements
    'canvas',                     // Canvas elements
    '[style*="background-image"]', // Elements with background images
  ];

  /**
   * Check if an element is visible
   * @param {HTMLElement} element - The element to check
   * @returns {boolean} - Whether the element is visible
   */
  function isVisible(element: HTMLElement) {
    // Use checkVisibility if available (modern browsers)
    if (typeof element.checkVisibility === 'function') {
      return element.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true,
      });
    }

    // Fallback for browsers that don't support checkVisibility
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0;
  }

  /**
   * Get a CSS selector for an element
   * @param {HTMLElement} element - The element to get a selector for
   * @returns {string} - The CSS selector
   */
  function getCssSelector(element: HTMLElement) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    // Try to build a selector with classes if available
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(Boolean);
      if (classes.length > 0) {
        // Use up to 2 classes to avoid overly complex selectors
        const classSelector = classes.slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
        const tagWithClass = `${element.tagName.toLowerCase()}${classSelector}`;

        // Check if this selector uniquely identifies the element
        if (document.querySelectorAll(tagWithClass).length === 1) {
          return tagWithClass;
        }
      }
    }

    // Build a path-based selector
    let current: HTMLElement | null = element;
    const path = [];

    while (current && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      // Add ID if available
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add position among siblings
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(child =>
          child.tagName === current!.tagName,
        );

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;

      // Limit path length to avoid overly complex selectors
      if (path.length >= 4) {
        break;
      }
    }

    return path.join(' > ');
  }

  /**
   * Get all visible elements on the page based on elementType
   * @returns {Record<string, unknown>[]} - Array of element information objects
   */
  function getElements(): Record<string, unknown>[] {
    // Select which selectors to use based on elementType
    const selectors: string[] = [];
    if (elementType === 'interactable' || elementType === 'all') {
      selectors.push(...interactableSelectors);
    }
    if (elementType === 'visual' || elementType === 'all') {
      selectors.push(...visualSelectors);
    }

    // Get all potentially matching elements
    const allElements: Element[] = [];
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!allElements.includes(element)) {
          allElements.push(element);
        }
      });
    });

    // Filter for visible elements and collect information
    const elementInfos = allElements
      .filter(element => isVisible(element as HTMLElement) && !(element as HTMLInputElement).disabled)
      .map(element => {
        const el = element as HTMLElement;
        const inputEl = element as HTMLInputElement;

        // Get element information
        const rect = el.getBoundingClientRect();
        const isInViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );

        // Build object with only defined values (no null clutter in TOON output)
        const info: Record<string, unknown> = {
          tagName: el.tagName.toLowerCase(),
          cssSelector: getCssSelector(el),
          isInViewport: isInViewport,
        };

        // Only add properties that have actual values
        const type = el.getAttribute('type');
        if (type) info.type = type;

        const id = el.id;
        if (id) info.id = id;

        const className = el.className;
        if (className && typeof className === 'string') info.className = className;

        const textContent = el.textContent?.trim();
        if (textContent) info.textContent = textContent;

        const value = inputEl.value;
        if (value) info.value = value;

        const placeholder = inputEl.placeholder;
        if (placeholder) info.placeholder = placeholder;

        const href = el.getAttribute('href');
        if (href) info.href = href;

        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) info.ariaLabel = ariaLabel;

        const role = el.getAttribute('role');
        if (role) info.role = role;

        // Visual element specific properties
        const src = el.getAttribute('src');
        if (src) info.src = src;

        const alt = el.getAttribute('alt');
        if (alt) info.alt = alt;

        // Check for background-image (only if it's a visual element type query)
        if (elementType === 'visual' || elementType === 'all') {
          const bgImage = window.getComputedStyle(el).backgroundImage;
          if (bgImage && bgImage !== 'none') info.backgroundImage = bgImage;
        }

        return info;
      });

    return elementInfos;
  }

  return getElements();
})();

export default elementsScript;