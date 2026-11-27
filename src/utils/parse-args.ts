export interface ParsedArgs {
  http: boolean;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
  /** addresses the HTTP server listens on: both loopbacks unless `--host` names one */
  hosts: string[];
}

function parseList(argv: string[], flag: string): string[] | null {
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  const raw = argv[idx + 1];
  if (!raw || raw.startsWith('--')) {
    throw new Error(`${flag} requires a comma-separated list`);
  }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const http = argv.includes('--http');

  const portIdx = argv.indexOf('--port');
  let port = 3000;
  if (portIdx !== -1) {
    const raw = argv[portIdx + 1];
    const parsed = Number(raw);
    if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('--port must be a valid number');
    }
    port = parsed;
  }

  const allowedHosts = parseList(argv, '--allowedHosts') ?? ['localhost', '127.0.0.1', '::1'];
  const allowedOrigins = parseList(argv, '--allowedOrigins') ?? [];

  const hostIdx = argv.indexOf('--host');
  const host = hostIdx === -1 ? undefined : argv[hostIdx + 1];
  if (hostIdx !== -1 && (!host || host.startsWith('--'))) throw new Error('--host requires an address');
  const hosts = host ? [host] : ['127.0.0.1', '::1'];

  return { http, port, allowedHosts, allowedOrigins, hosts };
}
