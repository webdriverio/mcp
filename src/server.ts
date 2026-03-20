#!/usr/bin/env node
import pkg from '../package.json' with { type: 'json' };
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
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
import { getAccessibilityToolDefinition, getAccessibilityTreeTool } from './tools/get-accessibility-tree.tool';
import { takeScreenshotTool, takeScreenshotToolDefinition } from './tools/take-screenshot.tool';
import {
  deleteCookiesTool,
  deleteCookiesToolDefinition,
  getCookiesTool,
  getCookiesToolDefinition,
  setCookieTool,
  setCookieToolDefinition,
} from './tools/cookies.tool';
import { startAppTool, startAppToolDefinition } from './tools/app-session.tool';
import {
  dragAndDropTool,
  dragAndDropToolDefinition,
  swipeTool,
  swipeToolDefinition,
  tapElementTool,
  tapElementToolDefinition,
} from './tools/gestures.tool';
import { getAppStateTool, getAppStateToolDefinition } from './tools/app-actions.tool';
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
import { attachBrowserTool, attachBrowserToolDefinition } from './tools/attach-browser.tool';
import { launchChromeTool, launchChromeToolDefinition } from './tools/launch-chrome.tool';
import { emulateDeviceTool, emulateDeviceToolDefinition } from './tools/emulate-device.tool';
import { withRecording } from './recording/step-recorder';
import { buildCurrentSessionSteps, buildSessionsIndex, buildSessionStepsById } from './recording/resources';

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
    resources: {},
  },
});

// Helper function to register tools using the new registerTool pattern
const registerTool = (definition: ToolDefinition, callback: ToolCallback) =>
  server.registerTool(definition.name, {
    description: definition.description,
    inputSchema: definition.inputSchema,
  }, callback);

// Browser and App Session Management
registerTool(startBrowserToolDefinition, withRecording('start_browser', startBrowserTool));
registerTool(startAppToolDefinition, withRecording('start_app_session', startAppTool));
registerTool(closeSessionToolDefinition, closeSessionTool);
registerTool(launchChromeToolDefinition, withRecording('launch_chrome', launchChromeTool));
registerTool(attachBrowserToolDefinition, withRecording('attach_browser', attachBrowserTool));
registerTool(emulateDeviceToolDefinition, emulateDeviceTool);
registerTool(navigateToolDefinition, withRecording('navigate', navigateTool));

// Element Discovery
registerTool(getVisibleElementsToolDefinition, getVisibleElementsTool);
registerTool(getAccessibilityToolDefinition, getAccessibilityTreeTool);

// Scrolling
registerTool(scrollToolDefinition, withRecording('scroll', scrollTool));

// Element Interaction
registerTool(clickToolDefinition, withRecording('click_element', clickTool));
registerTool(setValueToolDefinition, withRecording('set_value', setValueTool));

// Screenshots
registerTool(takeScreenshotToolDefinition, takeScreenshotTool);

// Cookies
registerTool(getCookiesToolDefinition, getCookiesTool);
registerTool(setCookieToolDefinition, setCookieTool);
registerTool(deleteCookiesToolDefinition, deleteCookiesTool);

// Mobile Gesture Tools
registerTool(tapElementToolDefinition, withRecording('tap_element', tapElementTool));
registerTool(swipeToolDefinition, withRecording('swipe', swipeTool));
registerTool(dragAndDropToolDefinition, withRecording('drag_and_drop', dragAndDropTool));

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

// Session Recording Resources
server.registerResource(
  'sessions',
  'wdio://sessions',
  { description: 'JSON index of all browser and app sessions with metadata and step counts' },
  async () => ({
    contents: [{ uri: 'wdio://sessions', mimeType: 'application/json', text: buildSessionsIndex() }],
  }),
);

server.registerResource(
  'session-current-steps',
  'wdio://session/current/steps',
  { description: 'JSON step log for the currently active session' },
  async () => {
    const payload = buildCurrentSessionSteps();
    return {
      contents: [{
        uri: 'wdio://session/current/steps',
        mimeType: 'application/json',
        text: payload?.stepsJson ?? '{"error":"No active session"}'
      }],
    };
  },
);

server.registerResource(
  'session-current-code',
  'wdio://session/current/code',
  { description: 'Generated WebdriverIO JS code for the currently active session' },
  async () => {
    const payload = buildCurrentSessionSteps();
    return {
      contents: [{
        uri: 'wdio://session/current/code',
        mimeType: 'text/plain',
        text: payload?.generatedJs ?? '// No active session'
      }],
    };
  },
);

server.registerResource(
  'session-steps',
  new ResourceTemplate('wdio://session/{sessionId}/steps', { list: undefined }),
  { description: 'JSON step log for a specific session by ID' },
  async (uri, { sessionId }) => {
    const payload = buildSessionStepsById(sessionId as string);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: payload?.stepsJson ?? `{"error":"Session not found: ${sessionId}"}`
      }],
    };
  },
);

server.registerResource(
  'session-code',
  new ResourceTemplate('wdio://session/{sessionId}/code', { list: undefined }),
  { description: 'Generated WebdriverIO JS code for a specific session by ID' },
  async (uri, { sessionId }) => {
    const payload = buildSessionStepsById(sessionId as string);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/plain',
        text: payload?.generatedJs ?? `// Session not found: ${sessionId}`
      }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('WebdriverIO MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
