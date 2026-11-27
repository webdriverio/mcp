import { z } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import type { RegisteredTool, ToolCallback, InitializeResult } from '@modelcontextprotocol/server';
import { McpServer } from '@modelcontextprotocol/server';
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
import { GROUPS, showAllTools, type ToolGroup } from './toolsets';
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
import { saveCodeTool, saveCodeToolDefinition } from './tools/save-code.tool';
import { registerRunCodeTool, runCodeTool } from './tools/run-code.tool';

const SESSION_TARGET_SCHEMA = z.string().optional().describe('Target session: map name or sessionId. Omit to use the default session.');

const GROUP_KEYWORDS: Record<ToolGroup, string> = {
  mocks: 'mock, stub, spy, intercept, network request, Electron API',
  cookies: 'cookie, session, login, auth',
  device: 'emulate, phone, tablet, viewport, geolocation, GPS',
  extensions: 'extension, crx, addon',
  attach: 'Chrome, remote debugging, CDP, attach, running session',
  elements: 'accessibility tree, selectors, element list',
  'cloud-apps': 'app upload, APK, IPA, BrowserStack, Sauce Labs, TestMu, TestingBot, Digital.ai',
};

const TOOL_FAMILIES = [
  '- Sessions: `start_session`, `close_session`. Browsers, Electron apps, Appium iOS/Android, cloud providers. Keywords: open, close, browser, appium, electron, cloud.',
  '- Page actions: `navigate`, `click_element`, `set_value`, `select_option`, `press_key`, `perform_actions`, `scroll`, `switch_tab`, `switch_frame`, `execute_script`. Keywords: click, type, fill, form, key, scroll, tab, iframe, javascript.',
  '- Snapshot and screenshots: `snapshot`, `get_screenshot`, `get_tabs`. Keywords: page state, refs, selectors, image.',
  '- Mobile gestures and device (Appium sessions): `tap_element`, `swipe`, `drag_and_drop`, `rotate_device`, `hide_keyboard`, `switch_context`, `get_contexts`, `get_app_state`. Keywords: tap, swipe, drag, rotate, keyboard, webview, native app.',
  '- Electron: `execute_electron_script`, `trigger_electron_deeplink`. Keywords: main process, deeplink, electron app.',
  '- Docs: `query_docs`. Keywords: WebdriverIO API, config, options.',
  '- Recording and code: `wdio://session/current/steps`, `wdio://session/current/code` (generated WebdriverIO JS).',
];

const HIDDEN_FAMILIES = (Object.keys(GROUPS) as ToolGroup[]).map((group) => {
  const { tools, desc } = GROUPS[group];
  return `- Group \`${group}\`: ${desc}. Tools: ${tools.map((tool) => `\`${tool}\``).join(', ')}. Keywords: ${GROUP_KEYWORDS[group]}.`;
});

const CODE_FAMILY = '- Code (opt-in): `run_code`. WebdriverIO code in Node with browser, $ and expect; variables persist between calls. Keywords: script, code, loop, batch, assertion.';

export function serverInstructions(allowCode: boolean): string {
  const families = allowCode ? [...TOOL_FAMILIES.slice(0, 2), CODE_FAMILY, ...TOOL_FAMILIES.slice(2)] : TOOL_FAMILIES;
  return 'MCP server for browser, local Electron application, and mobile app automation using WebdriverIO. Supports Chrome, Firefox, Edge, Safari, Electron renderer automation and main-process scripts, plus iOS/Android native app testing via Appium.' + [
    '',
    'Workflow:',
    '- snapshot, then act with refs.',
    '- Several steps in a row (fill a form, then submit): ONE perform_actions call.',
    '- Refs from the latest result stay valid until the page changes.',
    '',
    'Tool families. Groups below are hidden by default; if enable_tools is listed, call it with the group name:',
    ...families,
    ...HIDDEN_FAMILIES,
  ].join('\n');
}

type InitializeHandler = (request: unknown, extra: unknown) => Promise<InitializeResult>;

/** the SDK keeps its initialize handler private, so it is wrapped: the first tools/list follows this response, so tools must already be enabled */
function onClientInitialize(server: McpServer, onClient: (clientName: string | undefined) => void): void {
  const handlers = (server.server as unknown as { _requestHandlers: Map<string, InitializeHandler> })._requestHandlers;
  const initialize = handlers.get('initialize');
  if (!initialize) throw new Error('MCP SDK initialize handler not found; onClientInitialize needs updating for this SDK version');
  server.server.setRequestHandler('initialize', async (request, extra) => {
    const result = await initialize(request, extra);
    onClient(request.params.clientInfo?.name);
    return result;
  });
}

export function createServer(
  defaultNetworkLogs = parseNetworkLogsMode(process.env.WDIO_MCP_NETWORK_LOGS),
  { detectClient = false, allowCode = false }: { detectClient?: boolean; allowCode?: boolean } = {},
): McpServer {
  const server = new McpServer({
    title: 'WebdriverIO MCP Server',
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    websiteUrl: 'https://github.com/webdriverio/mcp',
  }, {
    instructions: serverInstructions(allowCode),
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
  registerRunCodeTool(registerTool, allowCode, instrument('run_code', runCodeTool));
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
  registerTool(saveCodeToolDefinition, saveCodeTool);

  const visibility = setupToolVisibility(tools, registerTool, showAllTools(undefined));
  server.server.onclose = visibility.dispose;
  if (detectClient) {
    onClientInitialize(server, (clientName) => {
      if (showAllTools(clientName)) visibility.showAll();
    });
  }

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
