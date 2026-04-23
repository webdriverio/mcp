#!/usr/bin/env node
import pkg from '../package.json' with { type: 'json' };
import http from 'node:http';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { parseArgs } from './utils/parse-args';
import { extractHost, sendJsonRpcError } from './utils/http-helpers';
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
import {
  accessibilityResource,
  appStateResource,
  browserstackLocalBinaryResource,
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
  tabsResource,
} from './resources';
import {
  closeSessionTool,
  closeSessionToolDefinition,
  startSessionTool,
  startSessionToolDefinition
} from './tools/session.tool';
import { switchTabTool, switchTabToolDefinition } from './tools/tabs.tool';
import { listAppsTool, listAppsToolDefinition, uploadAppTool, uploadAppToolDefinition, } from './tools/browserstack.tool';
import { screenshotTool, screenshotToolDefinition } from './tools/screenshot.tool';
import { accessibilityTool, accessibilityToolDefinition } from './tools/accessibility.tool';
import { getTabsTool, getTabsToolDefinition } from './tools/get-tabs.tool';
import { getContextsTool, getContextsToolDefinition } from './tools/get-contexts.tool';
import { appStateTool, appStateToolDefinition } from './tools/app-state.tool';
import { getCookiesTool, getCookiesToolDefinition } from './tools/get-cookies.tool';

console.log = (...args) => console.error('[LOG]', ...args);
console.info = (...args) => console.error('[INFO]', ...args);
console.warn = (...args) => console.error('[WARN]', ...args);
console.debug = (...args) => console.error('[DEBUG]', ...args);

function createServer(): McpServer {
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

  registerTool(executeScriptToolDefinition, withRecording('execute_script', executeScriptTool));
  registerTool(getElementsToolDefinition, getElementsTool);

  registerTool(listAppsToolDefinition, listAppsTool);
  registerTool(uploadAppToolDefinition, uploadAppTool);

  registerTool(screenshotToolDefinition, screenshotTool);
  registerTool(accessibilityToolDefinition, accessibilityTool);
  registerTool(getTabsToolDefinition, getTabsTool);
  registerTool(getContextsToolDefinition, getContextsTool);
  registerTool(appStateToolDefinition, appStateTool);
  registerTool(getCookiesToolDefinition, getCookiesTool);

  registerResource(sessionsIndexResource);
  registerResource(sessionCurrentStepsResource);
  registerResource(sessionCurrentCodeResource);
  registerResource(sessionStepsResource);
  registerResource(sessionCodeResource);

  registerResource(browserstackLocalBinaryResource);
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

  return server;
}

async function main() {
  let args: { http: boolean; port: number; allowedHosts: string[]; allowedOrigins: string[] };
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (args.http) {
    http.createServer((req, res) => {

      const host = extractHost(req.headers.host ?? '');
      if (!args.allowedHosts.includes(host)) {
        sendJsonRpcError(res, 403, -32000, 'Host not allowed');
        return;
      }

      const origin = req.headers.origin;
      if (origin) {
        const wildcard = args.allowedOrigins.includes('*');
        const allowed = wildcard || args.allowedOrigins.includes(origin);
        if (!allowed) {
          console.error(`[WARN] Blocked origin: ${origin}. Add --allowedOrigins ${origin} (or '*' for all) to allow it.`);
          sendJsonRpcError(res, 403, -32000, 'Origin not allowed');
          return;
        }
        res.setHeader('Access-Control-Allow-Origin', wildcard ? '*' : origin);
        if (!wildcard) res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, mcp-protocol-version');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      if (!req.url?.startsWith('/mcp')) {
        sendJsonRpcError(res, 404, -32601, 'Not found');
        return;
      }

      void (async () => {
        try {
          const chunks: Buffer[] = [];
          let totalSize = 0;
          for await (const chunk of req) {
            totalSize += (chunk as Buffer).length;
            if (totalSize > 1024 * 1024) {
              sendJsonRpcError(res, 413, -32600, 'Payload too large');
              return;
            }
            chunks.push(chunk as Buffer);
          }
          const raw = Buffer.concat(chunks).toString();
          let body: unknown;
          try {
            body = raw ? JSON.parse(raw) : undefined;
          } catch {
            sendJsonRpcError(res, 400, -32700, 'Parse error');
            return;
          }
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          await createServer().connect(transport);
          await transport.handleRequest(req, res, body);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'ECONNRESET' || code === 'ECONNABORTED' || (e as Error).message === 'aborted') return;
          console.error('[WARN] Request failed:', e);
          if (!res.headersSent) sendJsonRpcError(res, 500, -32603, 'Internal error');
        }
      })();
    }).listen(args.port, () => {
      const originsMsg = args.allowedOrigins.length ? args.allowedOrigins.join(', ') : '(none — browsers blocked)';
      console.error(`WebdriverIO MCP Server running on Streamable HTTP at http://localhost:${args.port}/mcp`);
      console.error(`  allowed hosts:   ${args.allowedHosts.join(', ')}`);
      console.error(`  allowed origins: ${originsMsg}`);
    });

  } else {
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
    console.error('WebdriverIO MCP Server running on stdio');
  }
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});