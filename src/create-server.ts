import { z } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import type { RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from './types/tool';
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
import { getElementsTool, getElementsToolDefinition } from './tools/get-elements.tool';
import { launchChromeTool, launchChromeToolDefinition } from './tools/launch-chrome.tool';
import { emulateDeviceTool, emulateDeviceToolDefinition } from './tools/emulate-device.tool';
import { withRecording } from './recording/step-recorder';
import { setupToolVisibility } from './tool-visibility';
import { withTrace } from './trace/recorder.js';
import {
  accessibilityResource,
  appStateResource,
  browserstackLocalBinaryResource,
  sessionLogsResource,
  saucelabsLocalBinaryResource,
  testmuLocalBinaryResource,
  testingbotLocalBinaryResource,
  capabilitiesResource,
  contextResource,
  contextsResource,
  cookiesResource,
  elementsResource,
  geolocationResource,
  screenshotResource,
  sessionCodeResource,
  sessionCurrentCodeResource,
  sessionCurrentStepsResource,
  sessionsIndexResource,
  sessionStepsResource,
  docsIndexResource,
  docsPageResource,
  tabsResource,
} from './resources';
import {
  attachSessionRecorded,
  attachSessionToolDefinition,
  closeSessionTool,
  closeSessionToolDefinition,
  createStartSessionTool,
  parseNetworkLogsMode,
  startSessionToolDefinition,
} from './tools/session.tool';
import { switchTabTool, switchTabToolDefinition } from './tools/tabs.tool';
import { switchFrameTool, switchFrameToolDefinition } from './tools/switch-frame.tool';
import { listAppsTool, listAppsToolDefinition, uploadAppTool, uploadAppToolDefinition } from './tools/cloud-provider.tool';
import { queryDocsTool, queryDocsToolDefinition } from './tools/query-docs.tool';
import { screenshotTool, screenshotToolDefinition } from './tools/screenshot.tool';
import { snapshotTool, snapshotToolDefinition } from './tools/snapshot.tool';
import { performActionsTool, performActionsToolDefinition, pressKeyTool, pressKeyToolDefinition, selectOptionTool, selectOptionToolDefinition } from './tools/page-input.tool';
import { accessibilityTool, accessibilityToolDefinition } from './tools/accessibility.tool';
import { getTabsTool, getTabsToolDefinition } from './tools/get-tabs.tool';
import { getContextsTool, getContextsToolDefinition } from './tools/get-contexts.tool';
import { appStateTool, appStateToolDefinition } from './tools/app-state.tool';
import { getCookiesTool, getCookiesToolDefinition } from './tools/get-cookies.tool';
import { openWebExtensionTool, openWebExtensionToolDefinition } from './tools/web-extension.tool';
import { executeElectronScriptTool, executeElectronScriptToolDefinition } from './tools/electron-execute.tool';
import { mockTool, mockToolDefinition, getMockCallsTool, getMockCallsToolDefinition, manageMockTool, manageMockToolDefinition } from './tools/mock.tool';
import { triggerElectronDeeplinkTool, triggerElectronDeeplinkToolDefinition } from './tools/electron-deeplink.tool';
import { withSessionTarget, withSessionlessContext } from './session/routing';

const SESSION_TARGET_SCHEMA = z.string().optional().describe('Target session: map name or sessionId. Omit to use the default session.');

export function createServer(
  defaultNetworkLogs = parseNetworkLogsMode(process.env.WDIO_MCP_NETWORK_LOGS),
): McpServer {
  const server = new McpServer({
    title: 'WebdriverIO MCP Server',
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    websiteUrl: 'https://github.com/webdriverio/mcp',
  }, {
    instructions: 'MCP server for browser, local Electron application, and mobile app automation using WebdriverIO. Supports Chrome, Firefox, Edge, Safari, Electron renderer automation and main-process scripts, plus iOS/Android native app testing via Appium.' + [
      '',
      'Workflow:',
      '- snapshot, then act with refs.',
      '- Several steps in a row (fill a form, then submit): ONE perform_actions call.',
      '- Refs from the latest result stay valid until the page changes.',
    ].join('\n'),
    capabilities: {
      tools: {},
      resources: {},
    },
  });

  const tools = new Map<string, RegisteredTool>();
  const registerTool = (definition: ToolDefinition, callback: ToolCallback) => {
    const routed = !definition.sessionless;
    const tool = server.registerTool(definition.name, {
      description: definition.description,
      inputSchema: routed ? { ...definition.inputSchema, session: SESSION_TARGET_SCHEMA } : definition.inputSchema,
      ...(definition.annotations && { annotations: definition.annotations }),
    }, routed ? withSessionTarget(definition.name, callback, definition.unqueued) : withSessionlessContext(callback));
    tools.set(definition.name, tool);
    return tool;
  };

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

  const instrument = (name: string, cb: ToolCallback): ToolCallback =>
    withTrace(name, withRecording(name, cb));

  registerTool(startSessionToolDefinition, withRecording('start_session', createStartSessionTool(defaultNetworkLogs)));
  registerTool(attachSessionToolDefinition, attachSessionRecorded);
  registerTool(closeSessionToolDefinition, closeSessionTool);
  registerTool(launchChromeToolDefinition, instrument('launch_chrome', launchChromeTool));
  registerTool(emulateDeviceToolDefinition, instrument('emulate_device', emulateDeviceTool));
  registerTool(navigateToolDefinition, instrument('navigate', navigateTool));

  registerTool(switchTabToolDefinition, instrument('switch_tab', switchTabTool));
  registerTool(switchFrameToolDefinition, instrument('switch_frame', switchFrameTool));

  registerTool(scrollToolDefinition, instrument('scroll', scrollTool));

  registerTool(clickToolDefinition, instrument('click_element', clickTool));
  registerTool(setValueToolDefinition, instrument('set_value', setValueTool));
  registerTool(selectOptionToolDefinition, instrument('select_option', selectOptionTool));
  registerTool(pressKeyToolDefinition, instrument('press_key', pressKeyTool));
  registerTool(performActionsToolDefinition, instrument('perform_actions', performActionsTool));
  registerTool(snapshotToolDefinition, snapshotTool);

  registerTool(setCookieToolDefinition, instrument('set_cookie', setCookieTool));
  registerTool(deleteCookiesToolDefinition, instrument('delete_cookies', deleteCookiesTool));

  registerTool(tapElementToolDefinition, instrument('tap_element', tapElementTool));
  registerTool(swipeToolDefinition, instrument('swipe', swipeTool));
  registerTool(dragAndDropToolDefinition, instrument('drag_and_drop', dragAndDropTool));

  registerTool(switchContextToolDefinition, instrument('switch_context', switchContextTool));

  registerTool(rotateDeviceToolDefinition, instrument('rotate_device', rotateDeviceTool));
  registerTool(hideKeyboardToolDefinition, instrument('hide_keyboard', hideKeyboardTool));
  registerTool(setGeolocationToolDefinition, instrument('set_geolocation', setGeolocationTool));

  registerTool(executeScriptToolDefinition, instrument('execute_script', executeScriptTool));
  registerTool(executeElectronScriptToolDefinition, instrument('execute_electron_script', executeElectronScriptTool));
  registerTool(mockToolDefinition, instrument('mock', mockTool));
  registerTool(getMockCallsToolDefinition, instrument('get_mock_calls', getMockCallsTool));
  registerTool(manageMockToolDefinition, instrument('manage_mock', manageMockTool));
  registerTool(triggerElectronDeeplinkToolDefinition, instrument('trigger_electron_deeplink', triggerElectronDeeplinkTool));
  registerTool(getElementsToolDefinition, getElementsTool);
  registerTool(openWebExtensionToolDefinition, instrument('open_web_extension', openWebExtensionTool));

  registerTool(listAppsToolDefinition, listAppsTool);
  registerTool(uploadAppToolDefinition, uploadAppTool);
  registerTool(queryDocsToolDefinition, queryDocsTool);

  registerTool(screenshotToolDefinition, screenshotTool);
  registerTool(accessibilityToolDefinition, accessibilityTool);
  registerTool(getTabsToolDefinition, getTabsTool);
  registerTool(getContextsToolDefinition, getContextsTool);
  registerTool(appStateToolDefinition, appStateTool);
  registerTool(getCookiesToolDefinition, getCookiesTool);

  const disposeToolVisibility = setupToolVisibility(tools, registerTool);
  server.server.onclose = disposeToolVisibility;

  registerResource(sessionsIndexResource);
  registerResource(sessionCurrentStepsResource);
  registerResource(sessionCurrentCodeResource);
  registerResource(sessionStepsResource);
  registerResource(sessionCodeResource);

  registerResource(sessionLogsResource);
  registerResource(browserstackLocalBinaryResource);
  registerResource(saucelabsLocalBinaryResource);
  registerResource(testmuLocalBinaryResource);
  registerResource(testingbotLocalBinaryResource);
  registerResource(capabilitiesResource);
  registerResource(elementsResource);
  registerResource(accessibilityResource);
  registerResource(screenshotResource);
  registerResource(cookiesResource);
  registerResource(appStateResource);
  registerResource(contextsResource);
  registerResource(contextResource);
  registerResource(geolocationResource);
  registerResource(tabsResource);

  registerResource(docsIndexResource);
  registerResource(docsPageResource);

  return server;
}
