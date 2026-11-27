import type { ToolCallback, CallToolResult } from '@modelcontextprotocol/server';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser } from '../session/state';
import { agentFor, errorResult } from '../session/agent';

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

interface SelectorArg {
  selector: string;
}

/** Matches only plain objects of the exact shape `{ selector: string }` */
function isSelectorArg(arg: unknown): arg is SelectorArg {
  if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) {
    return false;
  }
  const proto = Object.getPrototypeOf(arg);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  const keys = Object.keys(arg);
  return keys.length === 1 && keys[0] === 'selector' && typeof (arg as Record<string, unknown>).selector === 'string';
}

function selectorNotFoundError(error: unknown, selector: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string' && error.length > 0) {
    return new Error(error);
  }
  if (typeof error === 'object' && error !== null) {
    const { message, error: code } = error as { message?: unknown; error?: unknown };
    if (typeof message === 'string' && message.length > 0) {
      return new Error(message);
    }
    if (typeof code === 'string' && code.length > 0) {
      return new Error(`${code}: ${selector}`);
    }
  }
  return new Error(`Element not found for selector "${selector}"`);
}

export const executeScriptToolDefinition: ToolDefinition = {
  name: 'execute_script',
  description: 'Runs JavaScript in the page (`return` a value; pass `{ selector: "..." }` in args to resolve an element, plain strings stay strings) or, on Appium, a "mobile: <command>" with args. Prefer the dedicated tools for clicks and typing.',
  annotations: { title: 'Execute Script', destructiveHint: false },
  inputSchema: {
    script: z.string().describe('JavaScript, or "mobile: <command>" on Appium'),
    args: z.array(z.unknown()).optional().describe('Script arguments (use `{ selector: "..." }` to pass an element; plain strings stay strings), or the mobile command\'s parameters'),
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
    const isMobile = script.startsWith('mobile:');

    if (!isMobile && scriptArgs.some((arg) => isSelectorArg(arg) && !arg.selector.trim())) {
      throw new Error('Element selector must be a non-empty string');
    }

    // Resolve explicit `{ selector: "..." }` objects to elements in browser context; plain strings stay strings
    const resolvedArgs = await Promise.all(
      scriptArgs.map(async (arg) => {
        if (!isMobile && isSelectorArg(arg)) {
          const element = await browser.$(arg.selector);
          if (element?.error) {
            throw selectorNotFoundError(element.error, arg.selector);
          }
          return element;
        }
        return arg;
      })
    );

    // a script body can't use `await` at its top level; as an async function it can
    const body = !isMobile && /\bawait\b/.test(script) && !isFunctionExpression(script)
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
    return errorResult(e, 'Error executing script');
  }
};
