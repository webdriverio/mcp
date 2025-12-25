/**
 * Tool Executor
 * Executes tools using WebDriverIO and returns formatted results
 */

import { remote, type RemoteOptions } from 'webdriverio';
import getInteractableElements from '../scripts/get-interactable-elements.js';
import { formatElementsForAgent, formatSuccess, formatError } from './element-formatter.js';
import type { ToolCall, AgentConfig } from './types.js';

// Browser state (separate from MCP server state)
let browser: WebdriverIO.Browser | null = null;

/**
 * Execute a tool call and return the result
 */
export async function executeTool(
  call: ToolCall,
  config: AgentConfig,
): Promise<string> {
  try {
    switch (call.name) {
      case 'start_browser':
        return await executeStartBrowser(call.arguments, config);

      case 'navigate':
        return await executeNavigate(call.arguments);

      case 'get_visible_elements':
        return await executeGetVisibleElements();

      case 'click_element':
        return await executeClickElement(call.arguments);

      case 'set_value':
        return await executeSetValue(call.arguments);

      case 'press_keys':
        return await executePressKeys(call.arguments);

      case 'task_complete':
        return executeTaskComplete(call.arguments);

      default:
        return formatError(`Unknown tool: ${call.name}`);
    }
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Start browser session
 */
async function executeStartBrowser(
  args: Record<string, unknown>,
  config: AgentConfig,
): Promise<string> {
  if (browser) {
    return 'Browser already running. Proceeding with existing session.';
  }

  const headless = (args.headless as boolean) ?? config.headless;

  const chromeArgs = [
    '--window-size=1280,1080',
    '--no-sandbox',
    '--disable-search-engine-choice-screen',
    '--disable-infobars',
    '--log-level=3',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--disable-web-security',
    '--allow-running-insecure-content',
  ];

  if (headless) {
    chromeArgs.push('--headless=new');
    chromeArgs.push('--disable-gpu');
    chromeArgs.push('--disable-dev-shm-usage');
  }

  const options: RemoteOptions = {
    capabilities: {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: chromeArgs,
      },
      acceptInsecureCerts: true,
    },
  };

  browser = await remote(options);

  const mode = headless ? 'headless' : 'headed';
  return formatSuccess(`Browser started in ${mode} mode. Ready for navigation.`);
}

/**
 * Navigate to URL
 */
async function executeNavigate(args: Record<string, unknown>): Promise<string> {
  if (!browser) {
    return formatError('Browser not started. Call start_browser first.');
  }

  const url = args.url as string;
  if (!url) {
    return formatError('URL is required');
  }

  await browser.url(url);

  // Wait for page to stabilize (including cookie modals)
  await browser.pause(1500);

  // Auto-dismiss common cookie consent modals
  const dismissed = await autoDismissCookieModal(browser);

  const extra = dismissed ? ' Cookie consent dismissed.' : '';
  return formatSuccess(`Navigated to ${url}.${extra} Use get_visible_elements to see the page.`);
}

/**
 * Auto-dismiss common cookie consent modals
 * Returns true if a modal was dismissed
 */
async function autoDismissCookieModal(browser: WebdriverIO.Browser): Promise<boolean> {
  // Common cookie consent selectors (reject/decline preferred over accept)
  const cookieSelectors = [
    // Google
    '#W0wltc', // Google "Reject all"
    '#L2AGLb', // Google "Accept all"
    // Generic patterns
    'button[id*="reject"]',
    'button[id*="decline"]',
    'button[id*="accept"]',
    '[data-testid="cookie-policy-manage-dialog-btn-reject"]',
    '[data-testid="cookie-policy-dialog-accept-button"]',
    '.cookie-consent-reject',
    '.cookie-consent-accept',
    '#cookie-consent-reject',
    '#cookie-consent-accept',
    '#onetrust-reject-all-handler',
    '#onetrust-accept-btn-handler',
    '.cc-dismiss',
    '.cc-allow',
  ];

  for (const selector of cookieSelectors) {
    try {
      const element = await browser.$(selector);
      const exists = await element.isExisting();
      if (exists) {
        const displayed = await element.isDisplayed();
        if (displayed) {
          await element.click();
          await browser.pause(500); // Wait for modal to close
          return true;
        }
      }
    } catch {
      // Ignore errors, try next selector
    }
  }

  return false;
}

/**
 * Get visible elements on page
 */
async function executeGetVisibleElements(): Promise<string> {
  if (!browser) {
    return formatError('Browser not started. Call start_browser first.');
  }

  try {
    const elements = await browser.execute(getInteractableElements);

    // Filter to only viewport-visible elements
    const visibleElements = elements.filter((el: any) => el.isInViewport !== false);

    return formatElementsForAgent(visibleElements);
  } catch (error) {
    return formatError(`Failed to get elements: ${error}`);
  }
}

/**
 * Click an element
 */
async function executeClickElement(args: Record<string, unknown>): Promise<string> {
  if (!browser) {
    return formatError('Browser not started. Call start_browser first.');
  }

  const selector = args.selector as string;
  if (!selector) {
    return formatError('Selector is required');
  }

  try {
    const element = await browser.$(selector);

    // Wait for element to exist
    await element.waitForExist({ timeout: 5000 });

    // Scroll into view
    await element.scrollIntoView({ block: 'center', inline: 'center' });

    // Small pause for scroll animation
    await browser.pause(100);

    // Click
    await element.click();

    return formatSuccess(`Clicked element: ${selector}`);
  } catch (error) {
    return formatError(`Failed to click "${selector}": ${error}`);
  }
}

/**
 * Set value in input field
 */
async function executeSetValue(args: Record<string, unknown>): Promise<string> {
  if (!browser) {
    return formatError('Browser not started. Call start_browser first.');
  }

  const selector = args.selector as string;
  const value = args.value as string;

  if (!selector) {
    return formatError('Selector is required');
  }
  if (value === undefined || value === null) {
    return formatError('Value is required');
  }

  try {
    const element = await browser.$(selector);

    // Wait for element to exist
    await element.waitForExist({ timeout: 5000 });

    // Scroll into view
    await element.scrollIntoView({ block: 'center', inline: 'center' });

    // Clear and set value
    await element.clearValue();
    await element.setValue(value);

    return formatSuccess(`Entered "${value}" into ${selector}`);
  } catch (error) {
    return formatError(`Failed to enter value in "${selector}": ${error}`);
  }
}

/**
 * Press keyboard keys
 */
async function executePressKeys(args: Record<string, unknown>): Promise<string> {
  if (!browser) {
    return formatError('Browser not started. Call start_browser first.');
  }

  const keys = args.keys as string;
  if (!keys) {
    return formatError('Keys parameter is required');
  }

  try {
    await browser.keys(keys);
    return formatSuccess(`Pressed key(s): ${keys}`);
  } catch (error) {
    return formatError(`Failed to press keys: ${error}`);
  }
}

/**
 * Mark task as complete
 */
function executeTaskComplete(args: Record<string, unknown>): string {
  const summary = (args.summary as string) || 'Task completed';
  return `TASK_COMPLETE: ${summary}`;
}

/**
 * Check if browser is running
 */
export function isBrowserRunning(): boolean {
  return browser !== null;
}

/**
 * Close browser session (cleanup)
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.deleteSession();
    } catch {
      // Ignore errors during cleanup
    }
    browser = null;
  }
}

/**
 * Get current browser instance (for testing)
 */
export function getBrowserInstance(): WebdriverIO.Browser | null {
  return browser;
}
