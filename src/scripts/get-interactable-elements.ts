const elementsScript = () => (function () {
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
    if (element.className) {
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
    let current = element;
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
          child.tagName === current.tagName,
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
   * Get all interactable and visible elements on the page
   * @returns {ElementInfo[]} - Array of element information objects
   */
  function getInteractableElements() {

    // Get all potentially interactable elements
    const allElements = [];
    interactableSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!allElements.includes(element)) {
          allElements.push(element);
        }
      });
    });

    // Filter for visible elements and collect information
    const elementInfos = allElements
      .filter(element => isVisible(element) && !(element).disabled)
      .map(element => {
        // Get element information
        const rect = element.getBoundingClientRect();
        const isInViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );

        return {
          tagName: element.tagName.toLowerCase(),
          type: element.getAttribute('type') || undefined,
          id: element.id || undefined,
          className: element.className || undefined,
          textContent: element.textContent?.trim() || undefined,
          value: (element).value || undefined,
          placeholder: (element).placeholder || undefined,
          href: element.getAttribute('href') || undefined,
          ariaLabel: element.getAttribute('aria-label') || undefined,
          role: element.getAttribute('role') || undefined,
          cssSelector: getCssSelector(element),
          isInViewport: isInViewport,
        };
      });

    return [
      ...elementInfos,
    ];
  }

  return getInteractableElements();
})();

export default elementsScript;