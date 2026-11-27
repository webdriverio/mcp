import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCode } from '../../src/recording/code-generator';
import { getState } from '../../src/session/state';
import { withSessionTarget } from '../../src/session/routing';
import { saveCodeTool, saveCodeToolDefinition } from '../../src/tools/save-code.tool';
import type { SessionHistory } from '../../src/types/recording';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
const callTool = saveCodeTool as unknown as ToolFn;

const SESSION_ID = 'save-code-session';

const history: SessionHistory = {
  sessionId: SESSION_ID,
  type: 'browser',
  startedAt: new Date().toISOString(),
  capabilities: { browserName: 'chrome' },
  steps: [
    { index: 1, tool: 'navigate', params: { url: 'https://example.com' }, status: 'ok', durationMs: 1, timestamp: new Date().toISOString() },
    { index: 2, tool: 'click_element', params: { selector: '#go' }, status: 'ok', durationMs: 1, timestamp: new Date().toISOString() },
  ],
};

let dir: string;

function addSession(id: string, name?: string) {
  getState().browsers.set(id, {} as WebdriverIO.Browser);
  getState().sessionMetadata.set(id, { type: 'browser', capabilities: {}, isAttached: false, ...(name && { name }) });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'save-code-'));
  getState().sessionHistory.set(SESSION_ID, history);
  getState().currentSession = SESSION_ID;
});

afterEach(() => {
  getState().browsers.clear();
  getState().sessionMetadata.clear();
  getState().sessionHistory.clear();
  getState().currentSession = null;
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('save_code tool', () => {
  it('exposes a tool definition named save_code', () => {
    expect(saveCodeToolDefinition.name).toBe('save_code');
  });

  it('writes the generated code and reports absolute path, lines and steps', async () => {
    const target = join(dir, 'nested', 'flow.mjs');
    const result = await callTool({ path: target });

    expect(result.isError).toBeFalsy();
    const expected = generateCode(history);
    expect(readFileSync(target, 'utf8')).toBe(expected);
    expect(result.content[0].text).toContain(target);
    expect(result.content[0].text).toContain(`${history.steps.length} steps`);
    expect(result.content[0].text).toContain(`(${expected.split('\n').length} lines)`);
  });

  it('resolves a relative path against the working directory', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const result = await callTool({ path: 'relative.mjs' });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(join(dir, 'relative.mjs'), 'utf8')).toBe(generateCode(history));
    expect(result.content[0].text).toContain(join(dir, 'relative.mjs'));
  });

  it('saves the session named by the session argument, not the default', async () => {
    const namedId = 'named-session-id';
    const named: SessionHistory = { ...history, sessionId: namedId, steps: history.steps.slice(0, 1) };
    addSession(SESSION_ID);
    addSession(namedId, 'b');
    getState().sessionHistory.set(namedId, named);
    const routed = withSessionTarget('save_code', saveCodeTool) as unknown as (args: Record<string, unknown>, extra: unknown) => ReturnType<ToolFn>;
    const defaultPath = join(dir, 'default.mjs');
    const namedPath = join(dir, 'named.mjs');

    const result = await routed({ path: namedPath, session: 'b' }, {} as never);

    expect(result.isError).toBeFalsy();
    expect(readFileSync(namedPath, 'utf8')).toBe(generateCode(named));
    expect(existsSync(defaultPath)).toBe(false);
  });

  it('refuses to overwrite an existing file without overwrite', async () => {
    const target = join(dir, 'existing.mjs');
    await callTool({ path: target });
    const result = await callTool({ path: target });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('overwrite: true');
  });

  it('replaces an existing file when overwrite is true', async () => {
    const target = join(dir, 'existing.mjs');
    await callTool({ path: target });
    getState().sessionHistory.set(SESSION_ID, { ...history, steps: history.steps.slice(0, 1) });
    const result = await callTool({ path: target, overwrite: true });

    expect(result.isError).toBeFalsy();
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe(generateCode({ ...history, steps: history.steps.slice(0, 1) }));
  });

  it('returns an error when no session is active', async () => {
    getState().currentSession = null;
    const result = await callTool({ path: join(dir, 'none.mjs') });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active session');
    expect(existsSync(join(dir, 'none.mjs'))).toBe(false);
  });
});
