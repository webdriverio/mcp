import { spawn } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { coerceBoolean } from '../utils/zod-helpers';

const USER_DATA_DIR = join(tmpdir(), 'chrome-debug');

export const launchChromeToolDefinition: ToolDefinition = {
  name: 'launch_chrome',
  description: `Prepares and launches Chrome with remote debugging enabled so attach_browser() can connect.

Two modes:

  newInstance (default): Opens a Chrome window alongside your existing one using a separate
    profile dir. Your current Chrome session is untouched.

  freshSession: Launches Chrome with an empty profile (no cookies, no logins).

Use copyProfileFiles: true to carry over your cookies and logins into the debug session.
Note: changes made during the session won't sync back to your main profile.

After this tool succeeds, call attach_browser() to connect.`,
  inputSchema: {
    port: z.number().default(9222).describe('Remote debugging port (default: 9222)'),
    mode: z.enum(['newInstance', 'freshSession']).default('newInstance').describe(
      'newInstance: open alongside existing Chrome | freshSession: clean profile'
    ),
    copyProfileFiles: coerceBoolean.default(false).describe(
      'Copy your Default Chrome profile (cookies, logins) into the debug session.'
    ),
  },
};

function isMac(): boolean {
  return platform() === 'darwin';
}

function chromeExec(): string {
  if (isMac()) return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (platform() === 'win32') {
    const candidates = [
      join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join('C:', 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
  }
  return 'google-chrome';
}

function defaultProfileDir(): string {
  const home = homedir();
  if (isMac()) return join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  if (platform() === 'win32') return join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  return join(home, '.config', 'google-chrome');
}

function copyProfile(): void {
  const srcDir = defaultProfileDir();
  rmSync(USER_DATA_DIR, { recursive: true, force: true });
  mkdirSync(USER_DATA_DIR, { recursive: true });
  copyFileSync(join(srcDir, 'Local State'), join(USER_DATA_DIR, 'Local State'));
  cpSync(join(srcDir, 'Default'), join(USER_DATA_DIR, 'Default'), { recursive: true });

  // Remove singleton/lock files from the source Chrome instance.
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    rmSync(join(USER_DATA_DIR, f), { force: true });
  }

  // Remove session files — they reference the original profile's state and trigger
  // "Something went wrong when opening your profile" when Chrome opens the copy.
  for (const f of ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs']) {
    rmSync(join(USER_DATA_DIR, 'Default', f), { force: true });
  }

  // First Run sentinel tells Chrome this is a fresh start — suppresses first-run dialogs.
  writeFileSync(join(USER_DATA_DIR, 'First Run'), '');
}

function launchChrome(port: number): void {
  spawn(chromeExec(), [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--profile-directory=Default',
    '--no-first-run',
    '--disable-session-crashed-bubble',
  ], { detached: true, stdio: 'ignore' }).unref();
}

async function waitForCDP(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Chrome did not expose CDP on port ${port} within ${timeoutMs}ms`);
}

export const launchChromeTool: ToolCallback = async ({
  port = 9222,
  mode = 'newInstance',
  copyProfileFiles = false,
}: {
  port?: number;
  mode?: 'newInstance' | 'freshSession';
  copyProfileFiles?: boolean;
}): Promise<CallToolResult> => {
  const warnings: string[] = [];
  const notes: string[] = [];

  try {
    if (copyProfileFiles) {
      warnings.push('⚠️  Cookies and logins were copied at this moment. Changes during this session won\'t sync back to your main profile.');
      copyProfile();
    } else {
      notes.push(mode === 'newInstance'
        ? 'No profile copied — this instance starts with no cookies or logins.'
        : 'Fresh profile — no existing cookies or logins.');
      rmSync(USER_DATA_DIR, { recursive: true, force: true });
      mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    launchChrome(port);
    await waitForCDP(port);

    const lines = [
      `Chrome launched on port ${port} (mode: ${mode}).`,
      ...warnings,
      ...notes,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error launching Chrome: ${e}` }],
    };
  }
};