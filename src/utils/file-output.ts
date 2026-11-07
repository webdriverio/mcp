import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeSessionId } from '../session/context';
import { getState } from '../session/state';

export type OutputMode = 'inline' | 'file';

const DEFAULT_OUTPUT_PREFIX = 'wdio-mcp-outputs-';
const OUTPUT_DIR_PID_PATTERN = /^wdio-mcp-outputs-(?:(\d+)-)?/;
const OUTPUT_FILE_PATTERN = /^[a-zA-Z0-9._-]+-(?:snapshot(?:-find)?|elements)-\d+(?:-(\d+))?-[0-9a-f]{8}\.(?:txt|toon)$/;

const sessionOutputFiles = new Map<string, Set<string>>();
const privateSubdirs = new Map<string, string>();
const prunedBaseDirs = new Set<string>();
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

function isPrivateDirectory(dirPath: string): boolean {
  try {
    const stat = lstatSync(dirPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return false;
    }
    if (typeof process.getuid === 'function') {
      return stat.uid === process.getuid() && (stat.mode & 0o077) === 0;
    }
    return true;
  } catch {
    return false;
  }
}

function validateSafeParentDirectory(dirPath: string): ReturnType<typeof lstatSync> {
  const stat = lstatSync(dirPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Invalid output directory "${dirPath}": must be a real directory.`);
  }
  if (typeof process.getuid === 'function') {
    const currentUid = process.getuid();
    const isGroupOrWorldWritable = (stat.mode & 0o022) !== 0;
    const hasStickyBit = (stat.mode & 0o1000) !== 0;
    if (isGroupOrWorldWritable && !hasStickyBit) {
      throw new Error(
        `Unsafe output directory "${dirPath}": shared writable directories must have the sticky bit set.`,
      );
    }
    if (stat.uid !== currentUid && !hasStickyBit) {
      throw new Error(
        `Unsafe output directory "${dirPath}": directory must be owned by the current user or have the sticky bit set.`,
      );
    }
  }
  return stat;
}

function isTrackedOutputFile(filePath: string): boolean {
  for (const files of sessionOutputFiles.values()) {
    if (files.has(filePath)) return true;
  }
  return false;
}

function isActivePrivateSubdir(dirPath: string): boolean {
  if (privateDefaultOutputDir === dirPath) return true;
  for (const subdir of privateSubdirs.values()) {
    if (subdir === dirPath) return true;
  }
  return false;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function removeEmptyPrivateDir(dirPath: string): boolean {
  try {
    if (!isPrivateDirectory(dirPath)) return false;
    if (readdirSync(dirPath).length > 0) return false;
    rmdirSync(dirPath);
    return true;
  } catch {
    return false;
  }
}

function pruneDirectory(baseDir: string): void {
  try {
    const baseStat = lstatSync(baseDir);
    if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) return;
    const baseIsPrivate = isPrivateDirectory(baseDir);

    for (const entryName of readdirSync(baseDir)) {
      const entryPath = join(baseDir, entryName);
      if (entryName.startsWith(DEFAULT_OUTPUT_PREFIX)) {
        if (isActivePrivateSubdir(entryPath) || !isPrivateDirectory(entryPath)) continue;
        const dirMatch = entryName.match(OUTPUT_DIR_PID_PATTERN);
        const ownerPid = dirMatch?.[1] ? Number(dirMatch[1]) : undefined;
        if (ownerPid !== undefined && ownerPid !== process.pid && isProcessAlive(ownerPid)) {
          continue;
        }
        try {
          for (const childName of readdirSync(entryPath)) {
            const childPath = join(entryPath, childName);
            if (isTrackedOutputFile(childPath)) continue;
            try {
              const childStat = lstatSync(childPath);
              if (
                childStat.isFile() &&
                !childStat.isSymbolicLink() &&
                (typeof process.getuid !== 'function' || childStat.uid === process.getuid())
              ) {
                unlinkSync(childPath);
              }
            } catch {
              continue;
            }
          }
          removeEmptyPrivateDir(entryPath);
        } catch {
          continue;
        }
      } else if (baseIsPrivate && !isTrackedOutputFile(entryPath)) {
        const fileMatch = entryName.match(OUTPUT_FILE_PATTERN);
        if (!fileMatch) continue;
        const ownerPid = fileMatch[1] ? Number(fileMatch[1]) : undefined;
        if (ownerPid !== undefined && ownerPid !== process.pid && isProcessAlive(ownerPid)) {
          continue;
        }
        try {
          const entryStat = lstatSync(entryPath);
          if (
            entryStat.isFile() &&
            !entryStat.isSymbolicLink() &&
            (typeof process.getuid !== 'function' || entryStat.uid === process.getuid())
          ) {
            unlinkSync(entryPath);
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    return;
  }
}

export function pruneStaleOutputFiles(explicitDir?: string): void {
  const candidates = explicitDir?.trim()
    ? [explicitDir.trim()]
    : [tmpdir(), process.env.WDIO_MCP_OUTPUT_DIR?.trim()].filter((d): d is string => Boolean(d));
  for (const dir of candidates) {
    prunedBaseDirs.add(dir);
    pruneDirectory(dir);
  }
}

function ensurePrivateOutputDir(explicitDir?: string): { dir: string; usedPrivateSubdir: boolean } {
  const configuredDir = explicitDir?.trim() || process.env.WDIO_MCP_OUTPUT_DIR?.trim();
  if (configuredDir) {
    let created = false;
    try {
      lstatSync(configuredDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        mkdirSync(configuredDir, { recursive: true, mode: 0o700 });
        chmodSync(configuredDir, 0o700);
        created = true;
      } else {
        throw err;
      }
    }

    validateSafeParentDirectory(configuredDir);
    if (!prunedBaseDirs.has(configuredDir)) {
      pruneStaleOutputFiles(configuredDir);
    }

    if (created || isPrivateDirectory(configuredDir)) {
      return { dir: configuredDir, usedPrivateSubdir: false };
    }

    let subdir = privateSubdirs.get(configuredDir);
    if (!subdir || !isPrivateDirectory(subdir)) {
      subdir = mkdtempSync(join(configuredDir, `${DEFAULT_OUTPUT_PREFIX}${process.pid}-`));
      chmodSync(subdir, 0o700);
      if (!isPrivateDirectory(subdir)) {
        throw new Error(`Failed to create a private output directory inside "${configuredDir}".`);
      }
      privateSubdirs.set(configuredDir, subdir);
    }
    return { dir: subdir, usedPrivateSubdir: true };
  }

  const baseTmp = tmpdir();
  validateSafeParentDirectory(baseTmp);
  if (!prunedBaseDirs.has(baseTmp)) {
    pruneStaleOutputFiles(baseTmp);
  }
  if (!privateDefaultOutputDir || !isPrivateDirectory(privateDefaultOutputDir)) {
    privateDefaultOutputDir = mkdtempSync(join(baseTmp, `${DEFAULT_OUTPUT_PREFIX}${process.pid}-`));
    chmodSync(privateDefaultOutputDir, 0o700);
    if (!isPrivateDirectory(privateDefaultOutputDir)) {
      throw new Error(`Failed to create a private output directory inside "${baseTmp}".`);
    }
  }
  return { dir: privateDefaultOutputDir, usedPrivateSubdir: false };
}

export function writeSessionOutputFile(params: {
  kind: string;
  content: string;
  ext?: string;
  outputDir?: string;
}): { filePath: string; bytes: number; lines: number; usedPrivateSubdir: boolean } {
  const { kind, content, ext = 'txt', outputDir } = params;
  const sessionId = activeSessionId();
  const state = getState();
  if (!sessionId || !state.browsers.has(sessionId)) {
    throw new Error('Cannot write output file: session is already closed or inactive.');
  }

  const { dir, usedPrivateSubdir } = ensurePrivateOutputDir(outputDir);
  if (!isPrivateDirectory(dir)) {
    throw new Error(`Unsafe output directory "${dir}": directory is no longer private.`);
  }

  const prefix = sessionFilePrefix(sessionId);
  const safeKind = sanitizeSegment(kind);
  const fileName = `${prefix}-${safeKind}-${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}.${ext}`;
  const filePath = join(dir, fileName);

  const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(filePath, flags, 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, content, { encoding: 'utf8' });
  } finally {
    closeSync(fd);
  }

  const bytes = Buffer.byteLength(content, 'utf8');
  const lines = content.length === 0 ? 0 : content.split('\n').length;

  let files = sessionOutputFiles.get(sessionId);
  if (!files) {
    files = new Set<string>();
    sessionOutputFiles.set(sessionId, files);
  }
  files.add(filePath);

  return { filePath, bytes, lines, usedPrivateSubdir };
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
      continue;
    }
  }
  sessionOutputFiles.delete(sessionId);

  if (privateDefaultOutputDir && removeEmptyPrivateDir(privateDefaultOutputDir)) {
    privateDefaultOutputDir = null;
  }
  for (const [configuredDir, subdir] of privateSubdirs.entries()) {
    if (removeEmptyPrivateDir(subdir)) {
      privateSubdirs.delete(configuredDir);
    }
  }
}

export function cleanupAllOutputFiles(): void {
  for (const sessionId of Array.from(sessionOutputFiles.keys())) {
    cleanupSessionOutputFiles(sessionId);
  }
  if (privateDefaultOutputDir && removeEmptyPrivateDir(privateDefaultOutputDir)) {
    privateDefaultOutputDir = null;
  }
  for (const [configuredDir, subdir] of privateSubdirs.entries()) {
    if (removeEmptyPrivateDir(subdir)) {
      privateSubdirs.delete(configuredDir);
    }
  }
}
