import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeSessionId } from '../session/context';
import { getState } from '../session/state';

export type OutputMode = 'inline' | 'file';

const DEFAULT_OUTPUT_PREFIX = 'wdio-mcp-outputs-';

const sessionOutputFiles = new Map<string, Set<string>>();
const privateSubdirs = new Map<string, string>();
let privateDefaultOutputDir: string | null = null;

export function parseOutputMode(value: string | undefined): OutputMode {
  if (value === undefined || value.trim() === '') return 'inline';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'inline' || normalized === 'file') {
    return normalized;
  }
  throw new Error(`Invalid WDIO_MCP_OUTPUT_MODE value "${value}". Accepted values: inline, file.`);
}

export function resolveOutputMode(toolOutputMode?: OutputMode, defaultOutputMode?: OutputMode): OutputMode {
  if (toolOutputMode) return toolOutputMode;
  if (defaultOutputMode) return defaultOutputMode;
  return parseOutputMode(process.env.WDIO_MCP_OUTPUT_MODE);
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'session';
}

function sessionFilePrefix(sessionId: string): string {
  const shortId = sanitizeSegment(sessionId.slice(0, 8));
  const name = getState().sessionMetadata.get(sessionId)?.name;
  return name ? `${sanitizeSegment(name)}-${shortId}` : shortId;
}

function ensurePrivateOutputDir(explicitDir?: string): string {
  const configuredDir = explicitDir?.trim() || process.env.WDIO_MCP_OUTPUT_DIR?.trim();
  if (configuredDir) {
    const existed = existsSync(configuredDir);
    if (!existed) {
      mkdirSync(configuredDir, { recursive: true, mode: 0o700 });
    }
    const stat = lstatSync(configuredDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Invalid output directory "${configuredDir}": must be a real directory.`);
    }
    if (!existed) {
      chmodSync(configuredDir, 0o700);
      return configuredDir;
    }
    const isPrivateToCurrentUser =
      (typeof process.getuid !== 'function' || stat.uid === process.getuid()) &&
      (stat.mode & 0o077) === 0;
    if (isPrivateToCurrentUser) {
      return configuredDir;
    }
    let subdir = privateSubdirs.get(configuredDir);
    if (!subdir || !existsSync(subdir)) {
      subdir = mkdtempSync(join(configuredDir, DEFAULT_OUTPUT_PREFIX));
      chmodSync(subdir, 0o700);
      privateSubdirs.set(configuredDir, subdir);
    }
    return subdir;
  }

  if (!privateDefaultOutputDir || !existsSync(privateDefaultOutputDir)) {
    privateDefaultOutputDir = mkdtempSync(join(tmpdir(), DEFAULT_OUTPUT_PREFIX));
    chmodSync(privateDefaultOutputDir, 0o700);
  }
  return privateDefaultOutputDir;
}

let fileCounter = 0;

export function writeSessionOutputFile(params: {
  kind: string;
  content: string;
  ext?: string;
  outputDir?: string;
}): { filePath: string; bytes: number; lines: number } {
  const { kind, content, ext = 'txt', outputDir } = params;
  const sessionId = activeSessionId();
  const state = getState();
  if (!sessionId || !state.browsers.has(sessionId)) {
    throw new Error('Cannot write output file: session is already closed or inactive.');
  }

  const dir = ensurePrivateOutputDir(outputDir);

  fileCounter = (fileCounter + 1) % 1_000_000;
  const prefix = sessionFilePrefix(sessionId);
  const safeKind = sanitizeSegment(kind);
  const fileName = `${prefix}-${safeKind}-${Date.now()}-${fileCounter}.${ext}`;
  const filePath = join(dir, fileName);

  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  chmodSync(filePath, 0o600);
  const bytes = Buffer.byteLength(content, 'utf8');
  const lines = content.length === 0 ? 0 : content.split('\n').length;

  let files = sessionOutputFiles.get(sessionId);
  if (!files) {
    files = new Set<string>();
    sessionOutputFiles.set(sessionId, files);
  }
  files.add(filePath);

  return { filePath, bytes, lines };
}

export function summarizeSnapshot(text: string): { root: string; refCount: number } {
  const firstNonEmpty = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0 && !line.startsWith('#'));
  const root = firstNonEmpty
    ? firstNonEmpty.replace(/^-\s*/, '').replace(/\s*\[ref=[^\]]+\].*$/, '').slice(0, 80)
    : 'empty';
  const refs = text.match(/\[ref=e\d+\]/g);
  return { root, refCount: refs ? refs.length : 0 };
}

export function cleanupSessionOutputFiles(sessionId: string): void {
  const files = sessionOutputFiles.get(sessionId);
  if (!files) return;
  for (const filePath of files) {
    try {
      rmSync(filePath, { force: true });
    } catch {
      // Ignore best-effort cleanup errors
    }
  }
  sessionOutputFiles.delete(sessionId);
}
