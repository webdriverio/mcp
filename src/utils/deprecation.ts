export type DeprecatedEntry = 'snapshot' | 'trace' | 'show-trace' | 'accessibility';

const REMOVAL = 'It will be removed in @wdio/mcp v5.';

export const DEPRECATION_MESSAGES: Record<DeprecatedEntry, string> = {
  snapshot: `The "@wdio/mcp/snapshot" export is deprecated. ${REMOVAL} Use "@wdio/snapshot" instead.`,
  trace: `The "@wdio/mcp/trace" export is deprecated. ${REMOVAL} v5 records traces with @wdio/devtools-service, which has a different format and API.`,
  'show-trace': `"wdio-show-trace" is deprecated. ${REMOVAL} v5 traces are recorded by @wdio/devtools-service and opened with its "show-trace" bin.`,
  accessibility: `get_accessibility_tree and wdio://session/current/accessibility are deprecated. ${REMOVAL} Use the snapshot tool instead.`,
};

export const ACCESSIBILITY_DEPRECATED_PREFIX = 'Deprecated: removed in @wdio/mcp v5; use snapshot.';

const warned = new Set<DeprecatedEntry>();

export function warnDeprecated(entry: DeprecatedEntry): void {
  if (warned.has(entry) || process.noDeprecation) return;
  warned.add(entry);
  process.stderr.write(`(@wdio/mcp) DeprecationWarning: ${DEPRECATION_MESSAGES[entry]}\n`);
}
