export interface ParsedArgs {
  http: boolean;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
  /** list `run_code`, which runs WebdriverIO code in this process: `--allow-code` or `WDIO_MCP_RUN_CODE=1` */
  allowCode: boolean;
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

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedArgs {
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

  const allowCode = argv.includes('--allow-code') || ['1', 'true'].includes(env.WDIO_MCP_RUN_CODE?.toLowerCase() ?? '');

  return { http, port, allowedHosts, allowedOrigins, allowCode };
}
