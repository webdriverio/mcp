#!/usr/bin/env node
import pkg from '../package.json' with { type: 'json' };
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ToolDefinition } from './types/tool';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ResourceDefinition } from './types/resource';
import { navigateTool, navigateToolDefinition } from './tools/navigate.tool';
import { clickTool, clickToolDefinition } from './tools/click.tool';
import { setValueTool, setValueToolDefinition } from './tools/set-value.tool';
import { scrollTool, scrollToolDefinition } from './tools/scroll.tool';
import {
  deleteCookiesTool,
  deleteCookiesToolDefinition,
  setCookieTool,
  setCookieToolDefinition,
} from './tools/cookies.tool';
import {
  dragAndDropTool,
  dragAndDropToolDefinition,
  swipeTool,
  swipeToolDefinition,
  tapElementTool,
  tapElementToolDefinition,
} from './tools/gestures.tool';
import { switchContextTool, switchContextToolDefinition } from './tools/context.tool';
import {
  hideKeyboardTool,
  hideKeyboardToolDefinition,
  rotateDeviceTool,
  rotateDeviceToolDefinition,
  setGeolocationTool,
  setGeolocationToolDefinition,
} from './tools/device.tool';
import { executeScriptTool, executeScriptToolDefinition } from './tools/execute-script.tool';
import { executeSequenceTool, executeSequenceToolDefinition } from './tools/execute-sequence.tool';
import { launchChromeTool, launchChromeToolDefinition } from './tools/launch-chrome.tool';
import { emulateDeviceTool, emulateDeviceToolDefinition } from './tools/emulate-device.tool';
import { withRecording } from './recording/step-recorder';
import {
  sessionsIndexResource,
  sessionCurrentStepsResource,
  sessionCurrentCodeResource,
  sessionStepsResource,
  sessionCodeResource,
} from './resources/sessions.resource';
import { elementsResource } from './resources/elements.resource';
import { accessibilityResource } from './resources/accessibility.resource';
import { screenshotResource } from './resources/screenshot.resource';
import { cookiesResource } from './resources/cookies.resource';
import { appStateResource } from './resources/app-state.resource';
import { contextsResource, contextResource } from './resources/contexts.resource';
import { geolocationResource } from './resources/geolocation.resource';
import { tabsResource } from './resources/tabs.resource';
import { startSessionTool, startSessionToolDefinition, closeSessionTool, closeSessionToolDefinition } from './tools/session.tool';
import { switchTabTool, switchTabToolDefinition } from './tools/tabs.tool';

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

const registerTool = (definition: ToolDefinition, callback: ToolCallback) =>
  server.registerTool(definition.name, {
    description: definition.description,
    inputSchema: definition.inputSchema,
  }, callback);

const registerResource = (definition: ResourceDefinition) => {
  if ('uri' in definition) {
    server.registerResource(
      definition.name,
      definition.uri,
      { description: definition.description },
      definition.handler,
    );
  } else {
    server.registerResource(
      definition.name,
      definition.template,
      { description: definition.description },
      definition.handler,
    );
  }
};

registerTool(startSessionToolDefinition, withRecording('start_session', startSessionTool));
registerTool(closeSessionToolDefinition, closeSessionTool);
registerTool(launchChromeToolDefinition, withRecording('launch_chrome', launchChromeTool));
registerTool(emulateDeviceToolDefinition, emulateDeviceTool);
registerTool(navigateToolDefinition, withRecording('navigate', navigateTool));

registerTool(switchTabToolDefinition, switchTabTool);

registerTool(scrollToolDefinition, withRecording('scroll', scrollTool));

registerTool(clickToolDefinition, withRecording('click_element', clickTool));
registerTool(setValueToolDefinition, withRecording('set_value', setValueTool));

registerTool(setCookieToolDefinition, setCookieTool);
registerTool(deleteCookiesToolDefinition, deleteCookiesTool);

registerTool(tapElementToolDefinition, withRecording('tap_element', tapElementTool));
registerTool(swipeToolDefinition, withRecording('swipe', swipeTool));
registerTool(dragAndDropToolDefinition, withRecording('drag_and_drop', dragAndDropTool));

registerTool(switchContextToolDefinition, switchContextTool);

registerTool(rotateDeviceToolDefinition, rotateDeviceTool);
registerTool(hideKeyboardToolDefinition, hideKeyboardTool);
registerTool(setGeolocationToolDefinition, setGeolocationTool);

registerTool(executeScriptToolDefinition, executeScriptTool);

registerTool(executeSequenceToolDefinition, withRecording('execute_sequence', executeSequenceTool));

registerResource(sessionsIndexResource);
registerResource(sessionCurrentStepsResource);
registerResource(sessionCurrentCodeResource);
registerResource(sessionStepsResource);
registerResource(sessionCodeResource);

registerResource(elementsResource);
registerResource(accessibilityResource);
registerResource(screenshotResource);
registerResource(cookiesResource);
registerResource(appStateResource);
registerResource(contextsResource);
registerResource(contextResource);
registerResource(geolocationResource);
registerResource(tabsResource);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('WebdriverIO MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});