import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionError } from '@wdio/session/agent';
import { getState } from '../../src/session/state';
import { agentFor } from '../../src/session/agent';
import { withRecording } from '../../src/recording/step-recorder';
import { generateCode } from '../../src/recording/code-generator';
import { RUN_CODE_TIMEOUT_MS, registerRunCodeTool, runCodeTool, runCodeToolDefinition } from '../../src/tools/run-code.tool';
import { SNAPSHOT_MAX_CHARS } from '../../src/utils/snapshot-text';

type Result = { content: { type: string; text: string }[]; isError?: boolean };
const run = (code: string) => (runCodeTool as unknown as (a: { code: string }) => Promise<Result>)({ code });
const recorded = withRecording('run_code', runCodeTool) as unknown as (a: { code: string }) => Promise<Result>;
const text = (result: Result) => result.content.map((c) => c.text).join('\n');

/** enough of a browser for the real @wdio/session engine to run `exec` code that does not touch the page */
const stubBrowser = () => new Proxy({
  options: {}, capabilities: { browserName: 'chrome' }, sessionId: 'stub', isBidi: false, isMobile: false,
  getUrl: async () => 'about:blank', getTitle: async () => '', execute: async () => undefined, getWindowHandles: async () => ['main'],
} as Record<string, unknown>, {
  get: (target, key) => key in target ? target[key as string] : typeof key === 'string' && key !== 'then' ? async () => undefined : undefined,
}) as unknown as WebdriverIO.Browser;

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.browsers.set('s1', stubBrowser());
  state.currentSession = 's1';
  state.sessionMetadata.set('s1', { type: 'browser', capabilities: {}, isAttached: false });
  state.sessionHistory.set('s1', { sessionId: 's1', type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] });
});

describe('run_code', () => {
  it('needs a session', async () => {
    getState().currentSession = null;
    const result = await run('console.log(1)');
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('No active session');
  });

  it('runs the code through exec, bounded, and returns what it printed', async () => {
    const agent = await agentFor();
    const runAction = vi.spyOn(agent!, 'runAction');
    const result = await run('const total = [1, 2, 3].reduce((a, b) => a + b); console.log("total", total)');
    expect(result.isError).toBeUndefined();
    expect(text(result)).toBe('total 6');
    expect(runAction).toHaveBeenCalledWith('exec', { code: expect.any(String), $timeout: RUN_CODE_TIMEOUT_MS });
  });

  it('keeps top-level variables between calls', async () => {
    await run('const rows = ["a", "b"]');
    expect(text(await run('rows.length'))).toBe('2');
  });

  it('records the code it ran, and nothing for code that only reads', async () => {
    await recorded({ code: 'const picked = 3' });
    await recorded({ code: 'picked' });
    const steps = getState().sessionHistory.get('s1')!.steps;
    expect(steps.map((step) => step.code)).toEqual([['const picked = 3'], undefined]);
    const code = generateCode(getState().sessionHistory.get('s1')!);
    expect(code).toContain('picked = 3;');
    expect(code).toContain('// run_code: read only, nothing to replay');
    expect(code).not.toContain('[unknown tool]');
  });

  it('reports a failure with what the code printed before it', async () => {
    const result = await run('console.log("checked 4 rows"); throw new Error("row 5 is missing")');
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('row 5 is missing');
    expect(text(result)).toContain('checked 4 rows');
  });

  it('reports an engine timeout as an error', async () => {
    const agent = await agentFor();
    vi.spyOn(agent!, 'runAction').mockRejectedValueOnce(new SessionError('TIMEOUT', '"exec" did not finish within 60000ms; the code may still be running.'));
    const result = await run('await new Promise(() => {})');
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('did not finish within 60000ms');
  });

  it('caps a long error message', async () => {
    const result = await run('throw new Error("x".repeat(30000))');
    expect(result.isError).toBe(true);
    expect(text(result).length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
  });

  it('caps long output and writes the whole of it to a file', async () => {
    const result = await run('console.log("x".repeat(30000))');
    const output = text(result);
    expect(output.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
    const file = output.match(/Full output: (\S+)\./)?.[1];
    expect(file).toBeDefined();
    expect(fs.readFileSync(file!, 'utf8')).toBe('x'.repeat(30000));
  });

  it('still returns the capped output when the artifact cannot be written', async () => {
    const agent = await agentFor();
    const artifact = vi.spyOn(agent!.session, 'artifact').mockReturnValue('/nonexistent-dir/run-code.txt');
    const result = await run('console.log("x".repeat(30000))');
    artifact.mockRestore();
    expect(result.isError).toBeUndefined();
    const output = text(result);
    expect(output.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
    expect(output).toContain('showing the start');
    expect(output).not.toContain('Full output');
  });
});

describe('registerRunCodeTool', () => {
  it('registers run_code only when allowCode is on', () => {
    const registerTool = vi.fn();
    registerRunCodeTool(registerTool, false, runCodeTool);
    expect(registerTool).not.toHaveBeenCalled();
    registerRunCodeTool(registerTool, true, runCodeTool);
    expect(registerTool).toHaveBeenCalledWith(runCodeToolDefinition, runCodeTool);
  });
});
