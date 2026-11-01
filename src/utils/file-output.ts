import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeSessionId } from '../session/context';
import { getState } from '../session/state';

export type OutputMode = 'inline' | 'file';

const DEFAULT_OUTPUT_SUBDIR = 'wdio-mcp-outputs';

const sessionOutputFiles = new Map<string, Set<string>>();

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

function sessionFilePrefix(sessionId: string | undefined): string {
  if (!sessionId) return 'default';
  const shortId = sanitizeSegment(sessionId.slice(0, 8));
  const name = getState().sessionMetadata.get(sessionId)?.name;
  return name ? `${sanitizeSegment(name)}-${shortId}` : shortId;
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
  const dir = outputDir?.trim() || process.env.WDIO_MCP_OUTPUT_DIR?.trim() || join(tmpdir(), DEFAULT_OUTPUT_SUBDIR);
  mkdirSync(dir, { recursive: true });

  fileCounter = (fileCounter + 1) % 1_000_000;
  const prefix = sessionFilePrefix(sessionId);
  const safeKind = sanitizeSegment(kind);
  const fileName = `${prefix}-${safeKind}-${Date.now()}-${fileCounter}.${ext}`;
  const filePath = join(dir, fileName);

  writeFileSync(filePath, content, 'utf8');
  const bytes = Buffer.byteLength(content, 'utf8');
  const lines = content.length === 0 ? 0 : content.split('\n').length;

  if (sessionId) {
    let files = sessionOutputFiles.get(sessionId);
    if (!files) {
      files = new Set<string>();
      sessionOutputFiles.set(sessionId, files);
    }
    files.add(filePath);
  }

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
