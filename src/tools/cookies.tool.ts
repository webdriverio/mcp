import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { Cookie, SameSiteOptions } from '@wdio/protocols';
import type { ToolDefinition } from '../types/tool';

// Tool definitions
export const getCookiesToolDefinition: ToolDefinition = {
  name: 'get_cookies',
  description: 'gets all cookies or a specific cookie by name',
  inputSchema: {
    name: z.string().optional().describe('Optional cookie name to retrieve a specific cookie. If not provided, returns all cookies'),
  },
};

export const getCookiesTool: ToolCallback = async ({ name}: { name?: string }): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    if (name) {
      // Get specific cookie by name
      const cookie = await browser.getCookies([name]);
      if (cookie.length === 0) {
        return {
          content: [{ type: 'text', text: `Cookie "${name}" not found` }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(cookie[0], null, 2) }],
      };
    }
    // Get all cookies
    const cookies = await browser.getCookies();
    if (cookies.length === 0) {
      return {
        content: [{ type: 'text', text: 'No cookies found' }],
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(cookies, null, 2) }],
    };

  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error getting cookies: ${e}` }],
    };
  }
};

// Set a cookie
export const setCookieToolDefinition: ToolDefinition = {
  name: 'set_cookie',
  description: 'sets a cookie with specified name, value, and optional attributes',
  inputSchema: {
    name: z.string().describe('Cookie name'),
    value: z.string().describe('Cookie value'),
    domain: z.string().optional().describe('Cookie domain (defaults to current domain)'),
    path: z.string().optional().describe('Cookie path (defaults to "/")'),
    expires: z.number().optional().describe('Expiry date as Unix timestamp in seconds'),
    httpOnly: z.boolean().optional().describe('HttpOnly flag'),
    secure: z.boolean().optional().describe('Secure flag'),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional().describe('SameSite attribute'),
  },
};

export const setCookieTool: ToolCallback = async ({
  name,
  value,
  domain,
  path = '/',
  expires,
  httpOnly,
  secure,
  sameSite,
}: {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSiteOptions;
}): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    // Build cookie object
    const cookie: Cookie = {
      name,
      value,
      path,
      domain,
      expiry: expires,
      httpOnly,
      secure,
      sameSite,
    };

    await browser.setCookies(cookie);

    return {
      content: [{ type: 'text', text: `Cookie "${name}" set successfully` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error setting cookie: ${e}` }],
    };
  }
};

// Delete cookies
export const deleteCookiesToolDefinition: ToolDefinition = {
  name: 'delete_cookies',
  description: 'deletes all cookies or a specific cookie by name',
  inputSchema: {
    name: z.string().optional().describe('Optional cookie name to delete a specific cookie. If not provided, deletes all cookies'),
  },
};

export const deleteCookiesTool: ToolCallback = async ({ name}: { name?: string }): Promise<CallToolResult> => {
  try {
    const browser = getBrowser();

    if (name) {
      // Delete specific cookie by name
      await browser.deleteCookies([name]);
      return {
        content: [{ type: 'text', text: `Cookie "${name}" deleted successfully` }],
      };
    }
    // Delete all cookies
    await browser.deleteCookies();
    return {
      content: [{ type: 'text', text: 'All cookies deleted successfully' }],
    };

  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error deleting cookies: ${e}` }],
    };
  }
};
