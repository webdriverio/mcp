/**
 * Element Formatter
 * Formats element data concisely for the agent (token efficiency)
 */

interface ElementInfo {
  tagName: string;
  type?: string;
  id?: string;
  className?: string;
  textContent?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  ariaLabel?: string;
  role?: string;
  cssSelector?: string;
  isInViewport?: boolean;
}

/**
 * Format elements for agent consumption
 * Produces a concise, token-efficient representation
 */
export function formatElementsForAgent(elements: ElementInfo[]): string {
  if (!elements || elements.length === 0) {
    return 'No interactive elements found on the page.';
  }

  const lines: string[] = ['Interactive elements on page:'];

  elements.slice(0, 50).forEach((el, index) => {
    const line = formatSingleElement(el, index + 1);
    if (line) {
      lines.push(line);
    }
  });

  if (elements.length > 50) {
    lines.push(`... and ${elements.length - 50} more elements`);
  }

  return lines.join('\n');
}

/**
 * Format a single element concisely
 */
function formatSingleElement(el: ElementInfo, index: number): string {
  const parts: string[] = [];

  // Element type
  const type = getElementType(el);
  parts.push(`[${index}] ${type}`);

  // Identifying text (prioritized)
  const identifyingText = getIdentifyingText(el);
  if (identifyingText) {
    parts.push(`"${truncate(identifyingText, 40)}"`);
  }

  // Selector (most important for interaction)
  if (el.cssSelector) {
    parts.push(`-> ${el.cssSelector}`);
  }

  return parts.join(' ');
}

/**
 * Get a human-readable element type
 */
function getElementType(el: ElementInfo): string {
  const tag = el.tagName?.toLowerCase() || 'element';

  // Input types
  if (tag === 'input') {
    const inputType = el.type?.toLowerCase() || 'text';
    switch (inputType) {
      case 'submit':
        return 'submit-button';
      case 'button':
        return 'button';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'password':
        return 'password-input';
      case 'search':
        return 'search-input';
      case 'email':
        return 'email-input';
      default:
        return 'text-input';
    }
  }

  // Other common elements
  switch (tag) {
    case 'button':
      return 'button';
    case 'a':
      return 'link';
    case 'select':
      return 'dropdown';
    case 'textarea':
      return 'text-area';
    case 'img':
      return 'image';
    case 'form':
      return 'form';
    default:
      // Use role if available
      if (el.role) {
        return el.role;
      }
      return tag;
  }
}

/**
 * Get the most identifying text for an element
 */
function getIdentifyingText(el: ElementInfo): string | null {
  // Priority order for identifying text
  const candidates = [
    el.ariaLabel,
    el.textContent,
    el.placeholder,
    el.value,
    el.id ? `#${el.id}` : null,
  ];

  for (const text of candidates) {
    if (text && text.trim().length > 0) {
      return text.trim();
    }
  }

  return null;
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength - 3) + '...';
}

/**
 * Format a simple success message
 */
export function formatSuccess(message: string): string {
  return `Success: ${message}`;
}

/**
 * Format an error message
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: ${String(error)}`;
}
