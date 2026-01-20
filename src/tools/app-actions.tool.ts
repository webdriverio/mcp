import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

// Get App State Tool
export const getAppStateToolDefinition: ToolDefinition = {
  name: 'get_app_state',
  description: 'gets the state of an app (not installed, not running, background, foreground)',
  inputSchema: {
    bundleId: z.string().describe('App bundle ID (e.g., com.example.app)'),
  },
};

export const getAppStateTool: ToolCallback = async (args: {
  bundleId: string;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { bundleId } = args;

    const appIdentifier = browser.isAndroid
      ? { appId: bundleId }
      : { bundleId: bundleId };

    const state: string = await browser.execute('mobile: queryAppState', appIdentifier);

    const stateMap: Record<string, string> = {
      0: 'not installed',
      1: 'not running',
      2: 'running in background (suspended)',
      3: 'running in background',
      4: 'running in foreground',
    };

    return {
      content: [
        {
          type: 'text',
          text: `App state for ${bundleId}: ${stateMap[state] || 'unknown: ' + state}`,
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting app state: ${e}` }],
    };
  }
};

// Activate App Tool
export const activateAppToolDefinition: ToolDefinition = {
  name: 'activate_app',
  description: 'activates/brings an app to foreground',
  inputSchema: {
    bundleId: z.string().describe('App bundle ID to activate (e.g., com.example.app)'),
  },
};

export const activateAppTool: ToolCallback = async (args: {
  bundleId: string;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { bundleId } = args;

    const appIdentifier = browser.isAndroid
      ? { appId: bundleId }
      : { bundleId: bundleId };

    await browser.execute('mobile: activateApp', appIdentifier);

    return {
      content: [{ type: 'text', text: `Activated app: ${bundleId}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error activating app: ${e}` }],
    };
  }
};

// Terminate App Tool
export const terminateAppToolDefinition: ToolDefinition = {
  name: 'terminate_app',
  description: 'terminates a running app',
  inputSchema: {
    bundleId: z.string().describe('App bundle ID to terminate (e.g., com.example.app)'),
  },
};

export const terminateAppTool: ToolCallback = async (args: {
  bundleId: string;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { bundleId } = args;

    const appIdentifier = browser.isAndroid
      ? { appId: bundleId }
      : { bundleId: bundleId };

    await browser.execute('mobile: terminateApp', appIdentifier);

    return {
      content: [{ type: 'text', text: `Terminated app: ${bundleId}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error terminating app: ${e}` }],
    };
  }
};