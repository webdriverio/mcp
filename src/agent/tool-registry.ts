/**
 * Tool Registry
 * Converts Zod schemas to JSON Schema for Ollama and manages tool definitions
 */

import type { OllamaTool, ToolDefinition } from './types.js';

/**
 * MVP tools for the agent - minimal set for web automation
 */
export const MVP_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'start_browser',
      description: 'Launch Chrome browser. Must be called before any other tool.',
      parameters: {
        type: 'object',
        properties: {
          headless: {
            type: 'boolean',
            description: 'Run browser without visible window (default: false)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate to a URL in the browser.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to navigate to (e.g., "https://google.com")',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_visible_elements',
      description: 'Get all visible, interactable elements on the current page. Returns a list of elements with their selectors.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click_element',
      description: 'Click an element on the page using its CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the element to click (e.g., "#search-btn", ".submit-button", "input[name=\'q\']")',
          },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_value',
      description: 'Type text into an input field using its CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the input element',
          },
          value: {
            type: 'string',
            description: 'Text to type into the input',
          },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'press_keys',
      description: 'Press keyboard keys. Use "Enter" to submit a form or search.',
      parameters: {
        type: 'object',
        properties: {
          keys: {
            type: 'string',
            description: 'Key(s) to press (e.g., "Enter", "Tab", "Escape")',
          },
        },
        required: ['keys'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description: 'Call this when the task is finished. Provide a summary of what was accomplished.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Brief summary of what was done to complete the task',
          },
        },
        required: ['summary'],
      },
    },
  },
];

/**
 * Get tool names for quick lookup
 */
export function getToolNames(): string[] {
  return MVP_TOOLS.map((t) => t.function.name);
}

/**
 * Check if a tool name is valid
 */
export function isValidTool(name: string): boolean {
  return getToolNames().includes(name);
}

/**
 * Get tool definition by name
 */
export function getToolDefinition(name: string): OllamaTool | undefined {
  return MVP_TOOLS.find((t) => t.function.name === name);
}
