import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
// DeviceName is not in webdriverio's public exports but is required to satisfy browser.emulate('device', ...) overloads.
// This is a type-only import — it is stripped at build time by tsup and has no runtime impact.
import type { DeviceName } from 'webdriverio/build/deviceDescriptorsSource.js';
import { z } from 'zod';
import { getBrowser } from './browser.tool';

// Stores restore functions returned by browser.emulate(), keyed by sessionId
const restoreFunctions = new Map<string, () => Promise<void>>();

export const emulateDeviceToolDefinition: ToolDefinition = {
  name: 'emulate_device',
  description: `Emulate a mobile or tablet device in the current browser session (sets viewport, DPR, user-agent, touch events).

Requires a BiDi-enabled session: start_browser({ capabilities: { webSocketUrl: true } })

Usage:
  emulate_device()                    — list available device presets
  emulate_device({ device: "iPhone 15" })  — activate emulation
  emulate_device({ device: "reset" }) — restore desktop defaults`,
  inputSchema: {
    device: z.string().optional().describe(
      'Device preset name (e.g. "iPhone 15", "Pixel 7"). Omit to list available presets. Pass "reset" to restore desktop defaults.'
    ),
  },
};

export const emulateDeviceTool: ToolCallback = async ({
  device,
}: {
  device?: string;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const state = (getBrowser as any).__state;
    const sessionId = state.currentSession as string;
    const metadata = state.sessionMetadata.get(sessionId);

    // Guard: mobile sessions
    if (metadata?.type === 'ios' || metadata?.type === 'android') {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: emulate_device is only supported for web browser sessions, not iOS/Android.' }],
      };
    }

    // Guard: BiDi required
    if (!browser.isBidi) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Error: emulate_device requires a BiDi-enabled session.\nRestart the browser with: start_browser({ capabilities: { webSocketUrl: true } })',
        }],
      };
    }

    // List presets by triggering a known-bad device name and parsing the error
    if (!device) {
      try {
        await browser.emulate('device', '\u0000' as DeviceName);
      } catch (e) {
        const msg = String(e);
        const match = msg.match(/please use one of the following: (.+)$/);
        if (match) {
          const names = match[1].split(', ').sort();
          return {
            content: [{ type: 'text', text: `Available devices (${names.length}):\n${names.join('\n')}` }],
          };
        }
        return { isError: true, content: [{ type: 'text', text: `Error listing devices: ${e}` }] };
      }
      return { content: [{ type: 'text', text: 'Could not retrieve device list.' }] };
    }

    // Reset
    if (device === 'reset') {
      const restoreFn = restoreFunctions.get(sessionId);
      if (!restoreFn) {
        return { content: [{ type: 'text', text: 'No active device emulation to reset.' }] };
      }
      await restoreFn();
      restoreFunctions.delete(sessionId);
      return { content: [{ type: 'text', text: 'Device emulation reset to desktop defaults.' }] };
    }

    // Emulate device
    try {
      const restoreFn = await browser.emulate('device', device as DeviceName);
      restoreFunctions.set(sessionId, restoreFn as () => Promise<void>);
      return {
        content: [{ type: 'text', text: `Emulating "${device}".` }],
      };
    } catch (e) {
      const msg = String(e);
      if (msg.includes('Unknown device name')) {
        return {
          content: [{
            type: 'text',
            text: `Error: Unknown device "${device}". Call emulate_device() with no arguments to list valid names.`,
          }],
        };
      }
      return { isError: true, content: [{ type: 'text', text: `Error: ${e}` }] };
    }
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${e}` }],
    };
  }
};
