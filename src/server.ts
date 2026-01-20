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
import { clickTool, clickToolDefinition, clickToolViaText, clickViaTextToolDefinition } from './tools/click.tool';
import { setValueTool, setValueToolDefinition } from './tools/set-value.tool';
import { findElementTool, findElementToolDefinition } from './tools/find-element.tool';
import { getElementTextTool, getElementTextToolDefinition } from './tools/get-element-text.tool';
import { isDisplayedTool, isDisplayedToolDefinition } from './tools/is-displayed.tool';
import { scrollDownTool, scrollDownToolDefinition } from './tools/scroll-down.tool';
import { scrollUpTool, scrollUpToolDefinition } from './tools/scroll-up.tool';
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
  longPressTool,
  longPressToolDefinition,
  swipeTool,
  swipeToolDefinition,
  tapElementTool,
  tapElementToolDefinition,
} from './tools/gestures.tool';
import {
  activateAppTool,
  activateAppToolDefinition,
  getAppStateTool,
  getAppStateToolDefinition,
  terminateAppTool,
  terminateAppToolDefinition,
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
  getDeviceInfoTool,
  getDeviceInfoToolDefinition,
  getGeolocationTool,
  getGeolocationToolDefinition,
  getOrientationTool,
  getOrientationToolDefinition,
  hideKeyboardTool,
  hideKeyboardToolDefinition,
  isDeviceLockedTool,
  isDeviceLockedToolDefinition,
  isKeyboardShownTool,
  isKeyboardShownToolDefinition,
  lockDeviceTool,
  lockDeviceToolDefinition,
  openNotificationsTool,
  openNotificationsToolDefinition,
  pressKeyCodeTool,
  pressKeyCodeToolDefinition,
  rotateDeviceTool,
  rotateDeviceToolDefinition,
  sendKeysTool,
  sendKeysToolDefinition,
  setGeolocationTool,
  setGeolocationToolDefinition,
  shakeDeviceTool,
  shakeDeviceToolDefinition,
  unlockDeviceTool,
  unlockDeviceToolDefinition,
} from './tools/device.tool';
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
  instructions: 'MCP server for browser and mobile app automation using WebDriverIO. Supports Chrome browser control (headed/headless) and iOS/Android native app testing via Appium.',
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
registerTool(scrollDownToolDefinition, scrollDownTool);
registerTool(scrollUpToolDefinition, scrollUpTool);

// Element Interaction
registerTool(findElementToolDefinition, findElementTool);
registerTool(clickToolDefinition, clickTool);
registerTool(clickViaTextToolDefinition, clickToolViaText);
registerTool(setValueToolDefinition, setValueTool);

// Element Inspection
registerTool(getElementTextToolDefinition, getElementTextTool);
registerTool(isDisplayedToolDefinition, isDisplayedTool);

// Screenshots
registerTool(takeScreenshotToolDefinition, takeScreenshotTool);

// Cookies
registerTool(getCookiesToolDefinition, getCookiesTool);
registerTool(setCookieToolDefinition, setCookieTool);
registerTool(deleteCookiesToolDefinition, deleteCookiesTool);

// Mobile Gesture Tools
registerTool(tapElementToolDefinition, tapElementTool);
registerTool(swipeToolDefinition, swipeTool);
registerTool(longPressToolDefinition, longPressTool);
registerTool(dragAndDropToolDefinition, dragAndDropTool);

// App Lifecycle Management
registerTool(getAppStateToolDefinition, getAppStateTool);
registerTool(activateAppToolDefinition, activateAppTool);
registerTool(terminateAppToolDefinition, terminateAppTool);

// Context Switching (Native/WebView)
registerTool(getContextsToolDefinition, getContextsTool);
registerTool(getCurrentContextToolDefinition, getCurrentContextTool);
registerTool(switchContextToolDefinition, switchContextTool);

// Device Interaction
registerTool(getDeviceInfoToolDefinition, getDeviceInfoTool);
registerTool(rotateDeviceToolDefinition, rotateDeviceTool);
registerTool(getOrientationToolDefinition, getOrientationTool);
registerTool(lockDeviceToolDefinition, lockDeviceTool);
registerTool(unlockDeviceToolDefinition, unlockDeviceTool);
registerTool(isDeviceLockedToolDefinition, isDeviceLockedTool);
registerTool(shakeDeviceToolDefinition, shakeDeviceTool);
registerTool(sendKeysToolDefinition, sendKeysTool);
registerTool(pressKeyCodeToolDefinition, pressKeyCodeTool);
registerTool(hideKeyboardToolDefinition, hideKeyboardTool);
registerTool(isKeyboardShownToolDefinition, isKeyboardShownTool);
registerTool(openNotificationsToolDefinition, openNotificationsTool);
registerTool(getGeolocationToolDefinition, getGeolocationTool);
registerTool(setGeolocationToolDefinition, setGeolocationTool);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('WebdriverIO MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
