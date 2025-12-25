import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

// Get Device Info Tool
export const getDeviceInfoTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    // Get various device information
    const capabilities = browser.capabilities;
    const windowSize = await browser.getWindowSize();

    const info = {
      platformName: capabilities.platformName,
      platformVersion: capabilities['appium:platformVersion'],
      deviceName: capabilities['appium:deviceName'],
      automationName: capabilities['appium:automationName'],
      screenSize: `${windowSize.width}x${windowSize.height}`,
    };

    return {
      content: [
        {
          type: 'text',
          text: `Device Info:\n${Object.entries(info)
            .map(([key, value]) => `  ${key}: ${value}`)
            .join('\n')}`,
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting device info: ${e}` }],
    };
  }
};

// Rotate Device Tool
export const rotateDeviceToolArguments = {
  orientation: z.enum(['PORTRAIT', 'LANDSCAPE']).describe('Device orientation'),
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
      content: [{ type: 'text', text: `Error rotating device: ${e}` }],
    };
  }
};

// Get Orientation Tool
export const getOrientationTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    const orientation = await browser.getOrientation();

    return {
      content: [{ type: 'text', text: `Current orientation: ${orientation}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting orientation: ${e}` }],
    };
  }
};

// Lock Device Tool
export const lockDeviceTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    await browser.lock();

    return {
      content: [{ type: 'text', text: 'Device locked' }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error locking device: ${e}` }],
    };
  }
};

// Unlock Device Tool
export const unlockDeviceTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    await browser.unlock();

    return {
      content: [{ type: 'text', text: 'Device unlocked' }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error unlocking device: ${e}` }],
    };
  }
};

// Is Device Locked Tool
export const isDeviceLockedTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    const isLocked = await browser.isLocked();

    return {
      content: [{ type: 'text', text: `Device is ${isLocked ? 'locked' : 'unlocked'}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error checking lock status: ${e}` }],
    };
  }
};

// Shake Device Tool (iOS only)
export const shakeDeviceTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    await browser.shake();

    return {
      content: [{ type: 'text', text: 'Device shaken' }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error shaking device: ${e}` }],
    };
  }
};

// Send Keys Tool (Android only)
export const sendKeysToolArguments = {
  keys: z.array(z.string()).describe('Array of keys to send (e.g., ["h", "e", "l", "l", "o"])'),
};

export const sendKeysTool: ToolCallback = async (args: {
  keys: string[];
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { keys } = args;

    await browser.sendKeys(keys);

    return {
      content: [{ type: 'text', text: `Sent keys: ${keys.join('')}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error sending keys: ${e}` }],
    };
  }
};

// Press Key Code Tool (Android only)
export const pressKeyCodeToolArguments = {
  keyCode: z.number().describe('Android key code (e.g., 4 for BACK, 3 for HOME)'),
};

export const pressKeyCodeTool: ToolCallback = async (args: {
  keyCode: number;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { keyCode } = args;

    await browser.pressKeyCode(keyCode);

    return {
      content: [{ type: 'text', text: `Pressed key code: ${keyCode}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error pressing key code: ${e}` }],
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
      content: [{ type: 'text', text: `Error hiding keyboard: ${e}` }],
    };
  }
};

// Is Keyboard Shown Tool
export const isKeyboardShownTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    const isShown = await browser.isKeyboardShown();

    return {
      content: [{ type: 'text', text: `Keyboard is ${isShown ? 'shown' : 'hidden'}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error checking keyboard status: ${e}` }],
    };
  }
};

// Open Notifications Tool (Android only)
export const openNotificationsTool: ToolCallback = async (): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    await browser.openNotifications();

    return {
      content: [{ type: 'text', text: 'Opened notifications panel' }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error opening notifications: ${e}` }],
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
      content: [{ type: 'text', text: `Error getting geolocation: ${e}` }],
    };
  }
};

// Set Geolocation Tool
export const setGeolocationToolArguments = {
  latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
  longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
  altitude: z.number().optional().describe('Altitude in meters (optional)'),
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
      content: [{ type: 'text', text: `Error setting geolocation: ${e}` }],
    };
  }
};
