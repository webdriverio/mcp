/** longest snapshot text a tool or resource returns; `find` or `scope` narrow larger pages */
export const SNAPSHOT_MAX_CHARS = 12000;

const truncationNote = (kept: number, total: number) =>
  `\n… truncated (${kept} of ${total} chars). Narrow it with the snapshot tool's scope parameter.`;

export function truncateSnapshot(text: string): string {
  if (text.length <= SNAPSHOT_MAX_CHARS) return text;
  // kept never exceeds the cap, so the note sized for the cap's digits always fits
  const reserve = truncationNote(SNAPSHOT_MAX_CHARS, text.length).length;
  const head = text.slice(0, SNAPSHOT_MAX_CHARS - reserve);
  const lineEnd = head.lastIndexOf('\n');
  const kept = head.slice(0, lineEnd === -1 ? head.length : lineEnd);
  return kept + truncationNote(kept.length, text.length);
}
