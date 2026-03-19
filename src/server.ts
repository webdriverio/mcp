#!/usr/bin/env node
import pkg from '../package.json' with { type: 'json' };
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ToolDefinition } from './types/tool';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import {
  closeSessionTool,
  closeSessionToolDefinition,
  readTabs,
  startBrowserTool,
  startBrowserToolDefinition,
  switchTabTool,
  switchTabToolDefinition,
} from './tools/browser.tool';
import { navigateTool, navigateToolDefinition } from './tools/navigate.tool';
import { clickTool, clickToolDefinition } from './tools/click.tool';
import { setValueTool, setValueToolDefinition } from './tools/set-value.tool';
import { scrollTool, scrollToolDefinition } from './tools/scroll.tool';
import { readVisibleElements } from './tools/get-visible-elements.tool';
import { readAccessibilityTree } from './tools/get-accessibility-tree.tool';
import { readScreenshot } from './tools/take-screenshot.tool';
import {
  deleteCookiesTool,
  deleteCookiesToolDefinition,
  readCookies,
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
import { readAppState } from './tools/app-actions.tool';
import { readContexts, readCurrentContext, switchContextTool, switchContextToolDefinition, } from './tools/context.tool';
import {
  hideKeyboardTool,
  hideKeyboardToolDefinition,
  readGeolocation,
  rotateDeviceTool,
  rotateDeviceToolDefinition,
  setGeolocationTool,
  setGeolocationToolDefinition,
} from './tools/device.tool';
import { executeScriptTool, executeScriptToolDefinition } from './tools/execute-script.tool';
import { executeSequenceTool, executeSequenceToolDefinition } from './tools/execute-sequence.tool';
import { attachBrowserTool, attachBrowserToolDefinition } from './tools/attach-browser.tool';
import { launchChromeTool, launchChromeToolDefinition } from './tools/launch-chrome.tool';
import { emulateDeviceTool, emulateDeviceToolDefinition } from './tools/emulate-device.tool';
import { withRecording } from './recording/step-recorder';
import { buildCurrentSessionSteps, buildSessionsIndex, buildSessionStepsById } from './recording/resources';
import { parseBool, parseNumber, parseStringArray } from './utils/parse-variables';

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

// Tab Management
registerTool(switchTabToolDefinition, switchTabTool);

// Scrolling
registerTool(scrollToolDefinition, withRecording('scroll', scrollTool));

// Element Interaction
registerTool(clickToolDefinition, withRecording('click_element', clickTool));
registerTool(setValueToolDefinition, withRecording('set_value', setValueTool));

// Cookies (write operations only; read via resource)
registerTool(setCookieToolDefinition, setCookieTool);
registerTool(deleteCookiesToolDefinition, deleteCookiesTool);

// Mobile Gesture Tools
registerTool(tapElementToolDefinition, withRecording('tap_element', tapElementTool));
registerTool(swipeToolDefinition, withRecording('swipe', swipeTool));
registerTool(dragAndDropToolDefinition, withRecording('drag_and_drop', dragAndDropTool));

// Context Switching (Native/WebView)
registerTool(switchContextToolDefinition, switchContextTool);

// Device Interaction
registerTool(rotateDeviceToolDefinition, rotateDeviceTool);
registerTool(hideKeyboardToolDefinition, hideKeyboardTool);
registerTool(setGeolocationToolDefinition, setGeolocationTool);

// Script Execution (Browser JS / Appium Mobile Commands)
registerTool(executeScriptToolDefinition, executeScriptTool);

// Sequence Execution
registerTool(executeSequenceToolDefinition, withRecording('execute_sequence', executeSequenceTool));

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

// Resource: visible elements
server.registerResource(
  'session-current-elements',
  new ResourceTemplate('wdio://session/current/elements{?inViewportOnly,includeContainers,includeBounds,limit,offset}', { list: undefined }),
  { description: 'Interactable elements on the current page' },
  async (uri, variables) => {
    const result = await readVisibleElements({
      inViewportOnly: parseBool(variables.inViewportOnly as string | undefined, true),
      includeContainers: parseBool(variables.includeContainers as string | undefined, false),
      includeBounds: parseBool(variables.includeBounds as string | undefined, false),
      limit: parseNumber(variables.limit as string | undefined, 0),
      offset: parseNumber(variables.offset as string | undefined, 0),
    });
    return { contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.text }] };
  },
);

// Resource: accessibility tree
server.registerResource(
  'session-current-accessibility',
  new ResourceTemplate('wdio://session/current/accessibility{?limit,offset,roles}', { list: undefined }),
  { description: 'Accessibility tree for the current page' },
  async (uri, variables) => {
    const result = await readAccessibilityTree({
      limit: parseNumber(variables.limit as string | undefined, 100),
      offset: parseNumber(variables.offset as string | undefined, 0),
      roles: parseStringArray(variables.roles as string | undefined),
    });
    return { contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.text }] };
  },
);

// Resource: screenshot
server.registerResource(
  'session-current-screenshot',
  'wdio://session/current/screenshot',
  { description: 'Screenshot of the current page' },
  async () => {
    const result = await readScreenshot();
    return { contents: [{ uri: 'wdio://session/current/screenshot', mimeType: result.mimeType, blob: result.blob }] };
  },
);

// Resource: cookies
server.registerResource(
  'session-current-cookies',
  new ResourceTemplate('wdio://session/current/cookies{?name}', { list: undefined }),
  { description: 'Cookies for the current session' },
  async (uri, variables) => {
    const result = await readCookies(variables.name as string | undefined);
    return { contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.text }] };
  },
);

// Resource: app state
server.registerResource(
  'session-current-app-state',
  new ResourceTemplate('wdio://session/current/app-state/{bundleId}', { list: undefined }),
  { description: 'App state for a given bundle ID' },
  async (uri, variables) => {
    const result = await readAppState(variables.bundleId as string);
    return { contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.text }] };
  },
);

// Resource: contexts
server.registerResource(
  'session-current-contexts',
  'wdio://session/current/contexts',
  { description: 'Available contexts (NATIVE_APP, WEBVIEW)' },
  async () => {
    const result = await readContexts();
    return { contents: [{ uri: 'wdio://session/current/contexts', mimeType: result.mimeType, text: result.text }] };
  },
);

// Resource: current context
server.registerResource(
  'session-current-context',
  'wdio://session/current/context',
  { description: 'Currently active context' },
  async () => {
    const result = await readCurrentContext();
    return { contents: [{ uri: 'wdio://session/current/context', mimeType: result.mimeType, text: result.text }] };
  },
);

// Resource: geolocation
server.registerResource(
  'session-current-geolocation',
  'wdio://session/current/geolocation',
  { description: 'Current device geolocation' },
  async () => {
    const result = await readGeolocation();
    return { contents: [{ uri: 'wdio://session/current/geolocation', mimeType: result.mimeType, text: result.text }] };
  },
);

// Resource: browser tabs
server.registerResource(
  'session-current-tabs',
  'wdio://session/current/tabs',
  { description: 'Browser tabs in the current session' },

  async () => {
    const result = await readTabs();
    return { contents: [{ uri: 'wdio://session/current/tabs', mimeType: result.mimeType, text: result.text }] };
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
