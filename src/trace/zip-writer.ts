import yazl from 'yazl';
import type { TraceSession } from './types.js';

export function buildTraceZip(session: TraceSession): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zipFile = new yazl.ZipFile();

    const traceNdjson = session.events.map((e) => JSON.stringify(e)).join('\n');
    const traceBuffer = Buffer.from(traceNdjson, 'utf8');
    zipFile.addBuffer(traceBuffer, 'trace.trace');
    zipFile.addBuffer(Buffer.alloc(0), 'trace.network');

    for (const screenshot of session.screenshots) {
      zipFile.addBuffer(screenshot.data, `resources/${screenshot.resourceName}`);
    }

    zipFile.end();

    const chunks: Buffer[] = [];
    zipFile.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zipFile.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zipFile.outputStream.on('error', reject);
  });
}
