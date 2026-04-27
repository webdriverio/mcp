import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

export const executeScriptToolDefinition: ToolDefinition = {
  name: 'execute_script',
  description: 'Executes arbitrary JavaScript in browser page context or Appium mobile: commands. Can read/modify DOM, trigger events, terminate apps, or run Android shell commands — use only when no dedicated tool covers the action. Browser: pass JS in script, use \'return\' for values, string args matching selectors auto-resolve to elements. Mobile: use \'mobile: <command>\' syntax in script with args array (e.g. "mobile: pressKey", "mobile: activateApp"). Prefer click_element/set_value/get_elements for standard interactions.',
  annotations: { title: 'Execute Script', destructiveHint: false },
  inputSchema: {
    script: z.string().describe('JavaScript code (browser) or mobile command string like "mobile: pressKey" (Appium)'),
    args: z.array(z.any()).optional().describe('Arguments to pass to the script. For browser: element selectors or values. For mobile commands: command-specific parameters as objects.'),
  },
};

export const executeScriptTool: ToolCallback = async (args: {
  script: string;
  args?: unknown[];
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();
    const { script, args: scriptArgs = [] } = args;

    // For browser scripts with selector arguments, resolve them to elements
    const resolvedArgs = await Promise.all(
      scriptArgs.map(async (arg) => {
        // If it's a string that looks like a selector and we're in browser context, try to resolve it
        if (typeof arg === 'string' && !script.startsWith('mobile:')) {
          try {
            const element = await browser.$(arg);
            if (await element.isExisting()) {
              return element;
            }
          } catch {
            // Not a valid selector, pass as-is
          }
        }
        return arg;
      })
    );

    const result = await browser.execute(script, ...resolvedArgs);

    // Format result for display
    let resultText: string;
    if (result === undefined || result === null) {
      resultText = 'Script executed successfully (no return value)';
    } else if (typeof result === 'object') {
      try {
        resultText = `Result: ${JSON.stringify(result, null, 2)}`;
      } catch {
        resultText = `Result: ${String(result)}`;
      }
    } else {
      resultText = `Result: ${result}`;
    }

    return {
      content: [{ type: 'text', text: resultText }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error executing script: ${e}` }],
    };
  }
};
