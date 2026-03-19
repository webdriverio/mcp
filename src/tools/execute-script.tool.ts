import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';

export const executeScriptToolDefinition: ToolDefinition = {
  name: 'execute_script',
  description: `Executes JavaScript in browser or mobile commands via Appium.

**Option B for browser interaction** — prefer get_visible_elements or click_element/set_value with a selector instead. Use execute_script only when no dedicated tool covers the action (e.g. reading computed values, triggering custom events, scrolling to a position).

**Browser:** Runs JavaScript in page context. Use 'return' to get values back.
  - Example: execute_script({ script: "return document.title" })
  - Example: execute_script({ script: "return window.scrollY" })
  - Example: execute_script({ script: "arguments[0].click()", args: ["#myButton"] })

**Mobile (Appium):** Executes mobile-specific commands using 'mobile: <command>' syntax.
  - Press key (Android): execute_script({ script: "mobile: pressKey", args: [{ keycode: 4 }] }) // BACK=4, HOME=3
  - Activate app: execute_script({ script: "mobile: activateApp", args: [{ appId: "com.example" }] })
  - Terminate app: execute_script({ script: "mobile: terminateApp", args: [{ appId: "com.example" }] })
  - Deep link: execute_script({ script: "mobile: deepLink", args: [{ url: "myapp://screen", package: "com.example" }] })
  - Shell command (Android): execute_script({ script: "mobile: shell", args: [{ command: "dumpsys", args: ["battery"] }] })`,
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
