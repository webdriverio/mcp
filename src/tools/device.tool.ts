import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

export const hideKeyboardToolDefinition: ToolDefinition = {
  name: 'hide_keyboard',
  description: 'Dismisses the on-screen keyboard on mobile. Call after text entry when the keyboard obscures elements. No-op if already hidden. Mobile-only.',
  annotations: { title: 'Hide Keyboard', destructiveHint: false, idempotentHint: true },
  inputSchema: {},
};

export const rotateDeviceToolDefinition: ToolDefinition = {
  name: 'rotate_device',
  description: 'Rotates a mobile device to portrait or landscape orientation. Waits for the OS rotation animation to complete. Use to test orientation-dependent layouts. Mobile-only; no effect in browser sessions.',
  annotations: { title: 'Rotate Device', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    orientation: z.enum(['PORTRAIT', 'LANDSCAPE']).describe('Device orientation'),
  },
};

export const setGeolocationToolDefinition: ToolDefinition = {
  name: 'set_geolocation',
  description: 'Overrides GPS coordinates for the session. Affects navigator.geolocation in browsers and location services on mobile. Location permissions must already be granted to the app.',
  annotations: { title: 'Set Geolocation', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
    longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
    altitude: z.number().optional().describe('Altitude in meters (optional)'),
  },
};

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