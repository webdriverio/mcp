import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const snapshotFn = vi.fn();
const runFn = vi.fn();
const mockGetElements = vi.fn();

const fakeAgent = {
  snapshot: snapshotFn,
  run: runFn,
  session: { isWeb: true },
  actions: [],
};

vi.mock('../../src/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  agentFor: vi.fn(async () => fakeAgent),
}));

vi.mock('../../src/scripts/get-elements', () => ({
  getElements: (...args: unknown[]) => mockGetElements(...args),
}));

const { createSnapshotTool, snapshotTool } = await import('../../src/tools/snapshot.tool');
const { getElementsTool } = await import('../../src/tools/get-elements.tool');
const { getState } = await import('../../src/session/state');
const { closeSession, registerSession } = await import('../../src/session/lifecycle');
const { sessionContext, withSessionTarget } = await import('../../src/session/routing');
const { parseOutputMode } = await import('../../src/utils/file-output');

type Result = { content: { type: string; text: string }[]; isError?: boolean };
const call = (tool: unknown, args: Record<string, unknown>) =>
  (tool as (a: Record<string, unknown>) => Promise<Result>)(args);

function makeFakeBrowser(sessionId: string): WebdriverIO.Browser {
  return {
    sessionId,
    deleteSession: vi.fn(async () => {}),
    isAndroid: false,
    isIOS: false,
  } as unknown as WebdriverIO.Browser;
}

describe('snapshot & get_elements file output mode (#178)', () => {
  let tempDir: string;
  const savedOutputMode = process.env.WDIO_MCP_OUTPUT_MODE;
  const savedOutputDir = process.env.WDIO_MCP_OUTPUT_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'wdio-mcp-test-'));
    delete process.env.WDIO_MCP_OUTPUT_MODE;
    delete process.env.WDIO_MCP_OUTPUT_DIR;

    const state = getState();
    state.browsers.clear();
    state.sessionMetadata.clear();
    state.sessionHistory.clear();
    state.currentSession = null;

    registerSession(
      'sess-11112222-3333',
      makeFakeBrowser('sess-11112222-3333'),
      { type: 'browser', capabilities: {}, isAttached: false, provider: 'local' },
      {
        sessionId: 'sess-11112222-3333',
        type: 'browser',
        startedAt: new Date().toISOString(),
        capabilities: {},
        steps: [],
      },
    );
  });

  afterEach(() => {
    if (savedOutputMode === undefined) {
      delete process.env.WDIO_MCP_OUTPUT_MODE;
    } else {
      process.env.WDIO_MCP_OUTPUT_MODE = savedOutputMode;
    }

    if (savedOutputDir === undefined) {
      delete process.env.WDIO_MCP_OUTPUT_DIR;
    } else {
      process.env.WDIO_MCP_OUTPUT_DIR = savedOutputDir;
    }

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('defaults to inline mode and passes maxChars to agent.snapshot', async () => {
    snapshotFn.mockResolvedValue({
      text: '- main\n  - button "Save" [ref=e1]',
      notes: ['1 interactive element'],
    });

    const routedSnapshot = withSessionTarget('snapshot', snapshotTool);
    const result = await call(routedSnapshot, {});
    expect(snapshotFn).toHaveBeenCalledWith({
      interactive: true,
      scope: undefined,
      viewport: false,
      maxChars: 12000,
    });
    expect(result.content[0].text).toContain('button "Save" [ref=e1]');
    expect(result.content[0].text).toContain('1 interactive element');
  });

  it('writes untruncated snapshot to a file with owner-only permissions when outputMode is "file"', async () => {
    const sampleTree = [
      '- document "Checkout"',
      '  - button "Pay now" [ref=e1]',
      '  - textbox "Card number" [ref=e2]',
    ].join('\n');
    snapshotFn.mockResolvedValue({
      text: sampleTree,
      notes: ['Note: full page'],
    });

    const routedSnapshot = withSessionTarget('snapshot', snapshotTool);
    const result = await call(routedSnapshot, { outputMode: 'file' });

    expect(snapshotFn).toHaveBeenCalledWith({
      interactive: true,
      scope: undefined,
      viewport: false,
    });
    const message = result.content[0].text;
    expect(message).toContain('Snapshot written to ');
    expect(message).toContain('root: document "Checkout"');
    expect(message).toContain('2 refs');
    expect(message).toContain('4 lines');

    const match = message.match(/Snapshot written to ([^\s]+) \(/);
    expect(match).not.toBeNull();
    const filePath = match![1];
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe(`${sampleTree}\nNote: full page`);
    if (process.platform !== 'win32') {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(filePath)).mode & 0o777).toBe(0o700);
    }
    await closeSession('sess-11112222-3333', false, false);
  });

  it('respects WDIO_MCP_OUTPUT_MODE=file and WDIO_MCP_OUTPUT_DIR env vars, and allows inline override', async () => {
    process.env.WDIO_MCP_OUTPUT_MODE = 'file';
    process.env.WDIO_MCP_OUTPUT_DIR = tempDir;
    snapshotFn.mockResolvedValue({
      text: '- main\n  - link "Docs" [ref=e4]',
    });

    const envSnapshotTool = withSessionTarget(
      'snapshot',
      createSnapshotTool(parseOutputMode(process.env.WDIO_MCP_OUTPUT_MODE)),
    );
    const fileResult = await call(envSnapshotTool, {});
    expect(fileResult.content[0].text).toContain(`Snapshot written to ${tempDir}`);
    expect(fileResult.content[0].text).toContain('1 refs');

    const inlineResult = await call(envSnapshotTool, { outputMode: 'inline' });
    expect(inlineResult.content[0].text).toBe('- main\n  - link "Docs" [ref=e4]');
  });

  it('writes find results to a file when outputMode is "file"', async () => {
    runFn.mockResolvedValue({
      text: '- form [ref=e1]\n  - button "Submit" [ref=e2]',
    });

    const routedSnapshot = withSessionTarget('snapshot', snapshotTool);
    const result = await call(routedSnapshot, {
      find: 'Submit',
      outputMode: 'file',
      outputDir: tempDir,
    });

    expect(result.content[0].text).toContain('Snapshot written to ');
    expect(result.content[0].text).toContain('2 refs');
    const match = result.content[0].text.match(/Snapshot written to ([^\s]+) \(/);
    expect(match).not.toBeNull();
    expect(readFileSync(match![1], 'utf8')).toContain('button "Submit" [ref=e2]');
  });

  it('writes get_elements output to a file when outputMode is "file"', async () => {
    mockGetElements.mockResolvedValue({
      total: 2,
      showing: 2,
      hasMore: false,
      elements: [
        { name: 'Save', selector: '#save' },
        { name: 'Cancel', selector: '#cancel' },
      ],
    });

    const result = await sessionContext.run({ sessionId: 'sess-11112222-3333' }, () =>
      call(getElementsTool, { outputMode: 'file', outputDir: tempDir }),
    );

    expect(result.content[0].text).toContain('Elements written to ');
    expect(result.content[0].text).toContain('(2 of 2 elements,');
    const match = result.content[0].text.match(/Elements written to ([^\s]+) \(/);
    expect(match).not.toBeNull();
    expect(readFileSync(match![1], 'utf8')).toContain('#save');
  });

  it('names files per session and cleans them up when closeSession runs', async () => {
    registerSession(
      'aaaa1111-0000',
      makeFakeBrowser('aaaa1111-0000'),
      { type: 'browser', capabilities: {}, isAttached: false, provider: 'local' },
      {
        sessionId: 'aaaa1111-0000',
        type: 'browser',
        startedAt: new Date().toISOString(),
        capabilities: {},
        steps: [],
      },
      { name: 'alpha' },
    );
    registerSession(
      'bbbb2222-0000',
      makeFakeBrowser('bbbb2222-0000'),
      { type: 'browser', capabilities: {}, isAttached: false, provider: 'local' },
      {
        sessionId: 'bbbb2222-0000',
        type: 'browser',
        startedAt: new Date().toISOString(),
        capabilities: {},
        steps: [],
      },
      { keep: true, name: 'beta' },
    );

    snapshotFn.mockResolvedValue({ text: '- main\n  - button "Go" [ref=e1]' });
    const routedSnapshot = withSessionTarget('snapshot', snapshotTool);

    const alphaRes = await call(routedSnapshot, {
      session: 'alpha',
      outputMode: 'file',
      outputDir: tempDir,
    });
    const betaRes = await call(routedSnapshot, {
      session: 'beta',
      outputMode: 'file',
      outputDir: tempDir,
    });

    expect(alphaRes.content[0].text).toBe('[session: alpha (aaaa1111)]');
    expect(betaRes.content[0].text).toBe('[session: beta (bbbb2222)]');

    const alphaPath = alphaRes.content[1].text.match(/Snapshot written to ([^\s]+) \(/)![1];
    const betaPath = betaRes.content[1].text.match(/Snapshot written to ([^\s]+) \(/)![1];

    expect(alphaPath).toContain('alpha-aaaa1111-snapshot-');
    expect(betaPath).toContain('beta-bbbb2222-snapshot-');
    expect(existsSync(alphaPath)).toBe(true);
    expect(existsSync(betaPath)).toBe(true);

    await closeSession('aaaa1111-0000', false, false);
    expect(existsSync(alphaPath)).toBe(false);
    expect(existsSync(betaPath)).toBe(true);

    await closeSession('bbbb2222-0000', false, false);
    expect(existsSync(betaPath)).toBe(false);
  });

  it('rejects late file writes when a session was already closed or replaced', async () => {
    snapshotFn.mockImplementation(async () => {
      await closeSession('sess-11112222-3333', false, false);
      return { text: '- main\n  - button "Late" [ref=e1]' };
    });

    const routedSnapshot = withSessionTarget('snapshot', snapshotTool);
    const result = await call(routedSnapshot, { outputMode: 'file', outputDir: tempDir });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('session is already closed or inactive');
    expect(readdirSync(tempDir)).toEqual([]);
  });

  it('rejects invalid WDIO_MCP_OUTPUT_MODE values', () => {
    expect(() => parseOutputMode('invalid')).toThrow(
      'Invalid WDIO_MCP_OUTPUT_MODE value "invalid". Accepted values: inline, file.',
    );
  });
});
