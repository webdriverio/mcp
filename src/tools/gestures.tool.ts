import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

// Tap Tool
export const tapElementToolDefinition: ToolDefinition = {
  name: 'tap_element',
  description: 'taps an element by selector or screen coordinates (mobile)',
  inputSchema: {
    selector: z
      .string()
      .optional()
      .describe('Element selector (CSS, XPath, accessibility ID, or UiAutomator)'),
    x: z.number().optional().describe('X coordinate for screen tap (if no selector provided)'),
    y: z.number().optional().describe('Y coordinate for screen tap (if no selector provided)'),
  },
};

export const tapAction = async (args: {
  selector?: string;
  x?: number;
  y?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { selector, x, y } = args;

    if (selector) {
      const element = await browser.$(selector);
      await element.tap();
      return {
        content: [{ type: 'text', text: `Tapped element: ${selector}` }],
      };
    } else if (x !== undefined && y !== undefined) {
      await browser.tap({ x, y });
      return {
        content: [{ type: 'text', text: `Tapped at coordinates: (${x}, ${y})` }],
      };
    }

    return {
      isError: true,
      content: [{ type: 'text', text: 'Error: Must provide either selector or x,y coordinates' }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error tapping: ${e}` }],
    };
  }
};

export const tapElementTool: ToolCallback = async (args: {
  selector?: string;
  x?: number;
  y?: number;
}): Promise<CallToolResult> => tapAction(args);

// Swipe Tool
export const swipeToolDefinition: ToolDefinition = {
  name: 'swipe',
  description: 'performs a swipe gesture in specified direction (mobile)',
  inputSchema: {
    direction: z.enum(['up', 'down', 'left', 'right']).describe('Swipe direction'),
    duration: z
      .number()
      .min(100)
      .max(5000)
      .optional()
      .describe('Swipe duration in milliseconds (default: 500)'),
    percent: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Percentage of screen to swipe (0-1, default: 0.5 for up/down, 0.95 for left/right)'),
  },
};

// Map content direction to finger direction (inverted)
// "swipe left" = content moves left = finger moves right
const contentToFingerDirection: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export const swipeAction = async (args: {
  direction: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  percent?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { direction, duration, percent } = args;

    // Direction-specific defaults: vertical (up/down) = 0.5, horizontal (left/right) = 0.95
    const isVertical = direction === 'up' || direction === 'down';
    const defaultPercent = isVertical ? 0.5 : 0.95;
    const effectivePercent = percent ?? defaultPercent;
    const effectiveDuration = duration ?? 500;

    // Convert content direction to finger direction
    const fingerDirection = contentToFingerDirection[direction];
    await browser.swipe({ direction: fingerDirection, duration: effectiveDuration, percent: effectivePercent });

    return {
      content: [{ type: 'text', text: `Swiped ${direction}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error swiping: ${e}` }],
    };
  }
};

export const swipeTool: ToolCallback = async (args: {
  direction: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  percent?: number;
}): Promise<CallToolResult> => swipeAction(args);

// Drag and Drop Tool
export const dragAndDropToolDefinition: ToolDefinition = {
  name: 'drag_and_drop',
  description: 'drags an element to another element or coordinates (mobile)',
  inputSchema: {
    sourceSelector: z.string().describe('Source element selector to drag'),
    targetSelector: z.string().optional().describe('Target element selector to drop onto'),
    x: z.number().optional().describe('Target X offset (if no targetSelector)'),
    y: z.number().optional().describe('Target Y offset (if no targetSelector)'),
    duration: z.number().min(100).max(5000).optional().describe('Drag duration in milliseconds'),
  },
};

export const dragAndDropAction = async (args: {
  sourceSelector: string;
  targetSelector?: string;
  x?: number;
  y?: number;
  duration?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { sourceSelector, targetSelector, x, y, duration } = args;

    const sourceElement = await browser.$(sourceSelector);

    if (targetSelector) {
      const targetElement = await browser.$(targetSelector);
      await sourceElement.dragAndDrop(targetElement, { duration });
      return {
        content: [{ type: 'text', text: `Dragged ${sourceSelector} to ${targetSelector}` }],
      };
    } else if (x !== undefined && y !== undefined) {
      await sourceElement.dragAndDrop({ x, y }, { duration });
      return {
        content: [{ type: 'text', text: `Dragged ${sourceSelector} by (${x}, ${y})` }],
      };
    }

    return {
      isError: true,
      content: [{ type: 'text', text: 'Error: Must provide either targetSelector or x,y coordinates' }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error dragging: ${e}` }],
    };
  }
};

export const dragAndDropTool: ToolCallback = async (args: {
  sourceSelector: string;
  targetSelector?: string;
  x?: number;
  y?: number;
  duration?: number;
}): Promise<CallToolResult> => dragAndDropAction(args);