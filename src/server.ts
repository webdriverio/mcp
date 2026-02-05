#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ToolDefinition } from './types/tool';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import {
  closeSessionTool,
  closeSessionToolDefinition,
  startBrowserTool,
  startBrowserToolDefinition
} from './tools/browser.tool';
import { navigateTool, navigateToolDefinition } from './tools/navigate.tool';
import { clickTool, clickToolDefinition } from './tools/click.tool';
import { setValueTool, setValueToolDefinition } from './tools/set-value.tool';
import { scrollTool, scrollToolDefinition } from './tools/scroll.tool';
import { getVisibleElementsTool, getVisibleElementsToolDefinition } from './tools/get-visible-elements.tool';
import { takeScreenshotTool, takeScreenshotToolDefinition } from './tools/take-screenshot.tool';
import {
  deleteCookiesTool,
  deleteCookiesToolDefinition,
  getCookiesTool,
  getCookiesToolDefinition,
  setCookieTool,
  setCookieToolDefinition,
} from './tools/cookies.tool';
import { getAccessibilityToolDefinition, getAccessibilityTreeTool } from './tools/get-accessibility-tree.tool';
import { startAppTool, startAppToolDefinition } from './tools/app-session.tool';
import {
  dragAndDropTool,
  dragAndDropToolDefinition,
  swipeTool,
  swipeToolDefinition,
  tapElementTool,
  tapElementToolDefinition,
} from './tools/gestures.tool';
import {
  getAppStateTool,
  getAppStateToolDefinition,
} from './tools/app-actions.tool';
import {
  getContextsTool,
  getContextsToolDefinition,
  getCurrentContextTool,
  getCurrentContextToolDefinition,
  switchContextTool,
  switchContextToolDefinition
} from './tools/context.tool';
import {
  getGeolocationTool,
  getGeolocationToolDefinition,
  hideKeyboardTool,
  hideKeyboardToolDefinition,
  rotateDeviceTool,
  rotateDeviceToolDefinition,
  setGeolocationTool,
  setGeolocationToolDefinition,
} from './tools/device.tool';
import { executeScriptTool, executeScriptToolDefinition } from './tools/execute-script.tool';
import pkg from '../package.json' with { type: 'json' };

// IMPORTANT: Redirect all console output to stderr to avoid messing with MCP protocol (Chrome writes to console)
const _originalConsoleLog = console.log;
const _originalConsoleInfo = console.info;
const _originalConsoleWarn = console.warn;
const _originalConsoleDebug = console.debug;

console.log = (...args) => console.error('[LOG]', ...args);
console.info = (...args) => console.error('[INFO]', ...args);
console.warn = (...args) => console.error('[WARN]', ...args);
console.debug = (...args) => console.error('[DEBUG]', ...args);

const server = new McpServer({
  title: 'WebdriverIO MCP Server',
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  websiteUrl: 'https://github.com/webdriverio/mcp',
}, {
  instructions: 'MCP server for browser and mobile app automation using WebDriverIO. Supports Chrome, Firefox, Edge, and Safari browser control plus iOS/Android native app testing via Appium.',
  capabilities: {
    tools: {},
  },
});

// Helper function to register tools using the new registerTool pattern
const registerTool = (definition: ToolDefinition, callback: ToolCallback) =>
  server.registerTool(definition.name, {
    description: definition.description,
    inputSchema: definition.inputSchema,
  }, callback);

// Browser and App Session Management
registerTool(startBrowserToolDefinition, startBrowserTool);
registerTool(startAppToolDefinition, startAppTool);
registerTool(closeSessionToolDefinition, closeSessionTool);
registerTool(navigateToolDefinition, navigateTool);

// Element Discovery
registerTool(getVisibleElementsToolDefinition, getVisibleElementsTool);
registerTool(getAccessibilityToolDefinition, getAccessibilityTreeTool);

// Scrolling
registerTool(scrollToolDefinition, scrollTool);

// Element Interaction
registerTool(clickToolDefinition, clickTool);
registerTool(setValueToolDefinition, setValueTool);

// Screenshots
registerTool(takeScreenshotToolDefinition, takeScreenshotTool);

// Cookies
registerTool(getCookiesToolDefinition, getCookiesTool);
registerTool(setCookieToolDefinition, setCookieTool);
registerTool(deleteCookiesToolDefinition, deleteCookiesTool);

// Mobile Gesture Tools
registerTool(tapElementToolDefinition, tapElementTool);
registerTool(swipeToolDefinition, swipeTool);
registerTool(dragAndDropToolDefinition, dragAndDropTool);

// App Lifecycle Management
registerTool(getAppStateToolDefinition, getAppStateTool);

// Context Switching (Native/WebView)
registerTool(getContextsToolDefinition, getContextsTool);
registerTool(getCurrentContextToolDefinition, getCurrentContextTool);
registerTool(switchContextToolDefinition, switchContextTool);

// Device Interaction
registerTool(rotateDeviceToolDefinition, rotateDeviceTool);
registerTool(hideKeyboardToolDefinition, hideKeyboardTool);
registerTool(getGeolocationToolDefinition, getGeolocationTool);
registerTool(setGeolocationToolDefinition, setGeolocationTool);

// Script Execution (Browser JS / Appium Mobile Commands)
registerTool(executeScriptToolDefinition, executeScriptTool);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('WebdriverIO MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
