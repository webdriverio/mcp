import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';
import { agentFor } from '../session/agent';

const FUNCTION_SYNTAX = /^\s*(async\b|function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/;

/** a lone function or arrow expression is passed through as it is; anything else is a script body */
function isFunctionExpression(script: string): boolean {
  try {
    new Function(`return (${script})`);
  } catch {
    return false;
  }
  return FUNCTION_SYNTAX.test(script);
}

export const executeScriptToolDefinition: ToolDefinition = {
  name: 'execute_script',
  description: 'Runs JavaScript in the page (`return` a value; string args that match a selector are passed as elements) or, on Appium, a "mobile: <command>" with args. Prefer the dedicated tools for clicks and typing.',
  annotations: { title: 'Execute Script', destructiveHint: false },
  inputSchema: {
    script: z.string().describe('JavaScript, or "mobile: <command>" on Appium'),
    args: z.array(z.any()).optional().describe('Script arguments, or the mobile command\'s parameters'),
  },
};

export const executeScriptTool: ToolCallback = async (args: {
  script: string;
  args?: unknown[];
}): Promise<CallToolResult> => {
  try {
    const agent = await agentFor();
    const browser = agent?.scope ?? getBrowser();
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

    // a script body can't use `await` at its top level; as an async function it can
    const body = !script.startsWith('mobile:') && /\bawait\b/.test(script) && !isFunctionExpression(script)
      ? `return (async () => {\n${script}\n})()`
      : script;
    const result = await browser.execute(body, ...resolvedArgs);

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
