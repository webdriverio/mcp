import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

// Tap Element Tool
export const tapElementToolDefinition: ToolDefinition = {
  name: 'tap_element',
  description: 'taps an element by selector or coordinates (mobile)',
  inputSchema: {
    selector: z
      .string()
      .optional()
      .describe('Element selector (CSS, XPath, accessibility ID, or UiAutomator)'),
    x: z.number().optional().describe('X coordinate for tap (if no selector provided)'),
    y: z.number().optional().describe('Y coordinate for tap (if no selector provided)'),
  },
};

export const tapElementTool: ToolCallback = async (args: {
  selector?: string;
  x?: number;
  y?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { selector, x, y } = args;

    if (selector) {
      // Tap on element by selector
      const element = await browser.$(selector);
      await element.tap();
      return {
        content: [{ type: 'text', text: `Tapped element: ${selector}` }],
      };
    } else if (x !== undefined && y !== undefined) {
      // Tap at coordinates
      await browser.touchAction({
        action: 'tap',
        x,
        y,
      });
      return {
        content: [{ type: 'text', text: `Tapped at coordinates: (${x}, ${y})` }],
      };
    }
    return {
      content: [{ type: 'text', text: 'Error: Must provide either selector or x,y coordinates' }],
    };

  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error tapping element: ${e}` }],
    };
  }
};

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
    startX: z.number().optional().describe('Start X coordinate (optional, uses screen center)'),
    startY: z.number().optional().describe('Start Y coordinate (optional, uses screen center)'),
    distance: z
      .number()
      .optional()
      .describe('Swipe distance in pixels (optional, uses percentage of screen)'),
  },
};

export const swipeTool: ToolCallback = async (args: {
  direction: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  startX?: number;
  startY?: number;
  distance?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { direction, duration = 500, startX, startY, distance } = args;

    // Get screen size
    const windowSize = await browser.getWindowSize();
    const screenWidth = windowSize.width;
    const screenHeight = windowSize.height;

    // Calculate start and end coordinates
    const centerX = startX ?? screenWidth / 2;
    const centerY = startY ?? screenHeight / 2;

    const swipeDistance = distance ?? Math.min(screenWidth, screenHeight) * 0.5;

    let endX = centerX;
    let endY = centerY;

    switch (direction) {
      case 'up':
        endY = centerY - swipeDistance;
        break;
      case 'down':
        endY = centerY + swipeDistance;
        break;
      case 'left':
        endX = centerX - swipeDistance;
        break;
      case 'right':
        endX = centerX + swipeDistance;
        break;
    }

    // Perform swipe
    await browser.touchPerform([
      { action: 'press', options: { x: centerX, y: centerY } },
      { action: 'wait', options: { ms: duration } },
      { action: 'moveTo', options: { x: endX, y: endY } },
      { action: 'release', options: {} },
    ]);

    return {
      content: [
        {
          type: 'text',
          text: `Swiped ${direction} from (${Math.round(centerX)}, ${Math.round(centerY)}) to (${Math.round(endX)}, ${Math.round(endY)}) over ${duration}ms`,
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error swiping: ${e}` }],
    };
  }
};

// Long Press Tool
export const longPressToolDefinition: ToolDefinition = {
  name: 'long_press',
  description: 'performs a long press on element or coordinates (mobile)',
  inputSchema: {
    selector: z
      .string()
      .optional()
      .describe('Element selector (CSS, XPath, accessibility ID, or UiAutomator)'),
    x: z.number().optional().describe('X coordinate for long press (if no selector provided)'),
    y: z.number().optional().describe('Y coordinate for long press (if no selector provided)'),
    duration: z.number().min(500).max(10000).optional().describe('Long press duration in milliseconds (default: 1000)'),
  },
};

export const longPressTool: ToolCallback = async (args: {
  selector?: string;
  x?: number;
  y?: number;
  duration?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { selector, x, y, duration = 1000 } = args;

    if (selector) {
      // Long press on element by selector
      const element = await browser.$(selector);
      await element.touchAction([
        { action: 'longPress' },
        { action: 'wait', ms: duration },
        { action: 'release' },
      ]);
      return {
        content: [{ type: 'text', text: `Long pressed element: ${selector} for ${duration}ms` }],
      };
    } else if (x !== undefined && y !== undefined) {
      // Long press at coordinates
      await browser.touchPerform([
        { action: 'press', options: { x, y } },
        { action: 'wait', options: { ms: duration } },
        { action: 'release', options: {} },
      ]);
      return {
        content: [{ type: 'text', text: `Long pressed at coordinates: (${x}, ${y}) for ${duration}ms` }],
      };
    }
    return {
      content: [{ type: 'text', text: 'Error: Must provide either selector or x,y coordinates' }],
    };

  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error long pressing: ${e}` }],
    };
  }
};

// Drag and Drop Tool
export const dragAndDropToolDefinition: ToolDefinition = {
  name: 'drag_and_drop',
  description: 'drags from one location to another (mobile)',
  inputSchema: {
    fromSelector: z.string().optional().describe('Source element selector'),
    fromX: z.number().optional().describe('Source X coordinate'),
    fromY: z.number().optional().describe('Source Y coordinate'),
    toSelector: z.string().optional().describe('Target element selector'),
    toX: z.number().optional().describe('Target X coordinate'),
    toY: z.number().optional().describe('Target Y coordinate'),
    duration: z.number().min(100).max(5000).optional().describe('Drag duration in milliseconds (default: 500)'),
  },
};

export const dragAndDropTool: ToolCallback = async (args: {
  fromSelector?: string;
  fromX?: number;
  fromY?: number;
  toSelector?: string;
  toX?: number;
  toY?: number;
  duration?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { fromSelector, fromX, fromY, toSelector, toX, toY, duration = 500 } = args;

    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;

    // Get source coordinates
    if (fromSelector) {
      const element = await browser.$(fromSelector);
      const location = await element.getLocation();
      const size = await element.getSize();
      startX = location.x + size.width / 2;
      startY = location.y + size.height / 2;
    } else if (fromX !== undefined && fromY !== undefined) {
      startX = fromX;
      startY = fromY;
    } else {
      return {
        content: [{ type: 'text', text: 'Error: Must provide either fromSelector or fromX,fromY coordinates' }],
      };
    }

    // Get target coordinates
    if (toSelector) {
      const element = await browser.$(toSelector);
      const location = await element.getLocation();
      const size = await element.getSize();
      endX = location.x + size.width / 2;
      endY = location.y + size.height / 2;
    } else if (toX !== undefined && toY !== undefined) {
      endX = toX;
      endY = toY;
    } else {
      return {
        content: [{ type: 'text', text: 'Error: Must provide either toSelector or toX,toY coordinates' }],
      };
    }

    // Perform drag and drop
    await browser.touchPerform([
      { action: 'press', options: { x: startX, y: startY } },
      { action: 'wait', options: { ms: duration } },
      { action: 'moveTo', options: { x: endX, y: endY } },
      { action: 'release', options: {} },
    ]);

    return {
      content: [
        {
          type: 'text',
          text: `Dragged from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(endX)}, ${Math.round(endY)}) over ${duration}ms`,
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error dragging and dropping: ${e}` }],
    };
  }
};
