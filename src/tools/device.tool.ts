import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

// Tool Definitions for zero-argument tools
export const hideKeyboardToolDefinition: ToolDefinition = {
  name: 'hide_keyboard',
  description: 'hides the on-screen keyboard',
  inputSchema: {},
};

export const getGeolocationToolDefinition: ToolDefinition = {
  name: 'get_geolocation',
  description: 'gets current device geolocation',
  inputSchema: {},
};

// Tool Definitions for tools with arguments
export const rotateDeviceToolDefinition: ToolDefinition = {
  name: 'rotate_device',
  description: 'rotates device to portrait or landscape orientation',
  inputSchema: {
    orientation: z.enum(['PORTRAIT', 'LANDSCAPE']).describe('Device orientation'),
  },
};

export const setGeolocationToolDefinition: ToolDefinition = {
  name: 'set_geolocation',
  description: 'sets device geolocation (latitude, longitude, altitude)',
  inputSchema: {
    latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
    longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
    altitude: z.number().optional().describe('Altitude in meters (optional)'),
  },
};

// Rotate Device Tool
export const rotateDeviceTool: ToolCallback = async (args: {
  orientation: 'PORTRAIT' | 'LANDSCAPE';
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { orientation } = args;

    await browser.setOrientation(orientation);

    return {
      content: [{ type: 'text', text: `Device rotated to: ${orientation}` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error rotating device: ${e}` }],
    };
  }
};

// Hide Keyboard Tool
export const hideKeyboardTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    await browser.hideKeyboard();

    return {
      content: [{ type: 'text', text: 'Keyboard hidden' }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error hiding keyboard: ${e}` }],
    };
  }
};

// Get Geolocation Tool
export const getGeolocationTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    const location = await browser.getGeoLocation();

    return {
      content: [
        {
          type: 'text',
          text: `Location:\n  Latitude: ${location.latitude}\n  Longitude: ${location.longitude}\n  Altitude: ${location.altitude || 'N/A'}`,
        },
      ],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error getting geolocation: ${e}` }],
    };
  }
};

// Set Geolocation Tool
export const setGeolocationTool: ToolCallback = async (args: {
  latitude: number;
  longitude: number;
  altitude?: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { latitude, longitude, altitude } = args;

    await browser.setGeoLocation({ latitude, longitude, altitude });

    return {
      content: [
        {
          type: 'text',
          text: `Geolocation set to:\n  Latitude: ${latitude}\n  Longitude: ${longitude}${altitude ? `\n  Altitude: ${altitude}m` : ''}`,
        },
      ],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error setting geolocation: ${e}` }],
    };
  }
};
