import { existsSync, createReadStream } from 'node:fs';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';

const BS_API = 'https://api-cloud.browserstack.com';

function getAuth(): string | null {
  const user = process.env.BROWSERSTACK_USERNAME;
  const key = process.env.BROWSERSTACK_ACCESS_KEY;
  if (!user || !key) return null;
  return Buffer.from(`${user}:${key}`).toString('base64');
}

export interface BrowserStackApp {
  app_name: string;
  app_version: string;
  app_url: string;
  app_id: string;
  custom_id?: string;
  uploaded_at: string;
}

function formatAppList(apps: BrowserStackApp[]): string {
  if (apps.length === 0) return 'No apps found.';
  return apps.map((a) => {
    const id = a.custom_id ? ` [${a.custom_id}]` : '';
    return `${a.app_name} v${a.app_version}${id} — ${a.app_url} (${a.uploaded_at})`;
  }).join('\n');
}

// ─── list_apps ───────────────────────────────────────────────────────────────

export const listAppsToolDefinition: ToolDefinition = {
  name: 'list_apps',
  description: 'List apps uploaded to BrowserStack App Automate. Reads BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY from environment.',
  inputSchema: {
    sortBy: z.enum(['app_name', 'uploaded_at']).optional().default('uploaded_at').describe('Sort order for results'),
    organizationWide: coerceBoolean.optional().default(false).describe('List apps uploaded by all users in the organization (uses recent_group_apps endpoint). Defaults to false (own uploads only).'),
    limit: z.number().int().min(1).optional().default(20).describe('Maximum number of apps to return (only applies when organizationWide is true, default 20)'),
  },
};

export const listAppsTool: ToolCallback = async ({ sortBy = 'uploaded_at', organizationWide = false, limit = 20 }: { sortBy?: 'app_name' | 'uploaded_at'; organizationWide?: boolean; limit?: number }) => {
  const auth = getAuth();
  if (!auth) {
    return { isError: true as const, content: [{ type: 'text' as const, text: 'Missing credentials: set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables.' }] };
  }

  try {
    let url = `${BS_API}/app-automate/${organizationWide ? 'recent_group_apps' : 'recent_apps'}`;
    if (organizationWide && limit) url += `?limit=${limit}`;

    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const body = await res.text();
      return { isError: true as const, content: [{ type: 'text' as const, text: `BrowserStack API error ${res.status}: ${body}` }] };
    }

    const raw = await res.json();
    let apps: BrowserStackApp[] = Array.isArray(raw) ? raw : [];

    apps = sortBy === 'app_name' ? apps.sort((a, b) => a.app_name.localeCompare(b.app_name)) : apps.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());

    return { content: [{ type: 'text' as const, text: formatAppList(apps) }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error listing apps: ${e}` }] };
  }
};

// ─── upload_app ──────────────────────────────────────────────────────────────

export const uploadAppToolDefinition: ToolDefinition = {
  name: 'upload_app',
  description: 'Upload a local .apk or .ipa to BrowserStack App Automate. Returns a bs:// URL for use in start_session.',
  inputSchema: {
    path: z.string().describe('Absolute path to the .apk or .ipa file'),
    customId: z.string().optional().describe('Optional custom ID for the app (used to reference it later)'),
  },
};

export const uploadAppTool: ToolCallback = async ({ path, customId }: { path: string; customId?: string }) => {
  const auth = getAuth();
  if (!auth) {
    return { isError: true as const, content: [{ type: 'text' as const, text: 'Missing credentials: set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables.' }] };
  }

  if (!existsSync(path)) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `File not found: ${path}` }] };
  }

  try {
    const form = new FormData();
    const stream = createReadStream(path);
    const fileName = path.split('/').pop() ?? 'app';
    form.append('file', new Blob([stream as unknown as BlobPart]), fileName);
    if (customId) form.append('custom_id', customId);

    const res = await fetch(`${BS_API}/app-automate/upload`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      return { isError: true as const, content: [{ type: 'text' as const, text: `Upload failed ${res.status}: ${body}` }] };
    }

    const data = await res.json() as { app_url: string; custom_id?: string };
    const customIdNote = data.custom_id ? `\nCustom ID: ${data.custom_id}` : '';
    return { content: [{ type: 'text' as const, text: `Upload successful.\nApp URL: ${data.app_url}${customIdNote}\n\nUse this URL as the "app" parameter in start_session with provider: "browserstack".` }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error uploading app: ${e}` }] };
  }
};
