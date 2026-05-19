import { describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { createTraceSession } from '../../src/trace/state';
import { buildTraceZip } from '../../src/trace/zip-writer';
import type { TraceScreenshot } from '../../src/trace/types';

async function readZipEntries(zipBuffer: Buffer): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err);
      const entries: Record<string, string> = {};
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) return reject(streamErr);
          const chunks: Buffer[] = [];
          readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
          readStream.on('end', () => {
            entries[entry.fileName] = Buffer.concat(chunks).toString('utf8');
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => resolve(entries));
      zipfile.on('error', reject);
    });
  });
}

describe('buildTraceZip', () => {
  it('produces a zip with trace.trace and trace.network', async () => {
    const session = createTraceSession('zip-test-1', 'chromium', { width: 1280, height: 720 }, 'test');
    const zipBuffer = await buildTraceZip(session);

    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);

    const entries = await readZipEntries(zipBuffer);
    expect(Object.keys(entries)).toContain('trace.trace');
    expect(Object.keys(entries)).toContain('trace.network');
  });

  it('trace.trace is valid NDJSON with context-options as first line', async () => {
    const session = createTraceSession('zip-test-2', 'chromium', { width: 1280, height: 720 }, 'my session');
    const zipBuffer = await buildTraceZip(session);
    const entries = await readZipEntries(zipBuffer);

    const lines = entries['trace.trace'].trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const firstEvent = JSON.parse(lines[0]);
    expect(firstEvent.type).toBe('context-options');
    expect(firstEvent.version).toBe(8);
    expect(firstEvent.browserName).toBe('chromium');
    expect(firstEvent.libraryName).toBe('@wdio/mcp');
  });

  it('includes screenshot resources in the zip', async () => {
    const session = createTraceSession('zip-test-3', 'chromium', { width: 1280, height: 720 }, 'test');
    const screenshot: TraceScreenshot = {
      resourceName: 'page@zip-test3-1000.jpeg',
      data: Buffer.from('fake-jpeg'),
      width: 1280,
      height: 720,
    };
    session.screenshots.push(screenshot);

    const zipBuffer = await buildTraceZip(session);
    const entries = await readZipEntries(zipBuffer);
    expect(Object.keys(entries)).toContain(`resources/${screenshot.resourceName}`);
  });
});
