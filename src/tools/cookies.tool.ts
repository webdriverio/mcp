import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import type { Cookie } from '@wdio/protocols';
import { coerceBoolean } from '../utils/zod-helpers';

export const setCookieToolDefinition: ToolDefinition = {
  name: 'set_cookie',
  description: 'sets a cookie with specified name, value, and optional attributes',
  inputSchema: {
    name: z.string().describe('Cookie name'),
    value: z.string().describe('Cookie value'),
    domain: z.string().optional().describe('Cookie domain (defaults to current domain)'),
    path: z.string().optional().describe('Cookie path (defaults to "/")'),
    expiry: z.number().optional().describe('Expiry date as Unix timestamp in seconds'),
    httpOnly: coerceBoolean.optional().describe('HttpOnly flag'),
    secure: coerceBoolean.optional().describe('Secure flag'),
    sameSite: z.enum(['strict', 'lax', 'none']).optional().describe('SameSite attribute'),
  },
};

export const setCookieTool: ToolCallback = async ({
  name,
  value,
  domain,
  path = '/',
  expiry,
  httpOnly,
  secure,
  sameSite,
}: Cookie): Promise<CallToolResult> => {
  try {
    const cookie: Cookie = { name, value, path, domain, expiry, httpOnly, secure, sameSite };
    const { getBrowser } = await import('../session/state');
    const browser = getBrowser();
    await browser.setCookies(cookie);

    return {
      content: [{ type: 'text', text: `Cookie "${name}" set successfully` }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error setting cookie: ${e}` }],
    };
  }
};

export const deleteCookiesToolDefinition: ToolDefinition = {
  name: 'delete_cookies',
  description: 'deletes all cookies or a specific cookie by name',
  inputSchema: {
    name: z.string().optional().describe('Optional cookie name to delete a specific cookie. If not provided, deletes all cookies'),
  },
};

export const deleteCookiesTool: ToolCallback = async ({ name }: { name?: string }): Promise<CallToolResult> => {
  try {
    const { getBrowser } = await import('../session/state');
    const browser = getBrowser();

    if (name) {
      await browser.deleteCookies([name]);
      return {
        content: [{ type: 'text', text: `Cookie "${name}" deleted successfully` }],
      };
    }
    await browser.deleteCookies();
    return {
      content: [{ type: 'text', text: 'All cookies deleted successfully' }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error deleting cookies: ${e}` }],
    };
  }
};