import { describe, expect, it } from 'vitest';
import { SNAPSHOT_MAX_CHARS, truncateSnapshot } from '../../src/utils/snapshot-text';

const NOTE_PATTERN = /\n… truncated: showing (\d+) of (\d+) chars; the rest is NOT in this output and there is no paging, so do not call again\. Next: snapshot find:"<text>" to locate it, then snapshot selectors:true scope:"<ref or css>" for its selector\.$/;

const lines = (count: number) => Array.from({ length: count }, (_, i) => `  e${i}  button "Item ${i}"  →  #item-${i}`).join('\n');

describe('truncateSnapshot', () => {
  it('returns text exactly at the cap unchanged', () => {
    const text = 'x'.repeat(SNAPSHOT_MAX_CHARS);
    expect(truncateSnapshot(text)).toBe(text);
  });

  it('returns text under the cap unchanged', () => {
    const text = lines(5);
    expect(truncateSnapshot(text)).toBe(text);
  });

  it('cuts over-cap text at a line boundary and keeps the total within the cap', () => {
    const text = lines(1000);
    const result = truncateSnapshot(text);
    const [note, kept, total] = result.match(NOTE_PATTERN) ?? [];
    expect(note).toBeDefined();
    expect(result.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
    expect(text[Number(kept)]).toBe('\n');
    expect(result.startsWith(text.slice(0, Number(kept)))).toBe(true);
    expect(Number(total)).toBe(text.length);
  });

  it('hard-cuts over-cap text without newlines and keeps the total within the cap', () => {
    const text = 'y'.repeat(SNAPSHOT_MAX_CHARS * 2);
    const result = truncateSnapshot(text);
    expect(result.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
    expect(result.startsWith('y')).toBe(true);
    expect(result).toMatch(NOTE_PATTERN);
  });

  it('reports the kept length and the original length in the note', () => {
    const text = lines(1000);
    const result = truncateSnapshot(text);
    const [, kept, total] = result.match(NOTE_PATTERN) ?? [];
    expect(result).toBe(text.slice(0, Number(kept)) + `\n… truncated: showing ${kept} of ${text.length} chars; the rest is NOT in this output and there is no paging, so do not call again. Next: snapshot find:"<text>" to locate it, then snapshot selectors:true scope:"<ref or css>" for its selector.`);
    expect(Number(total)).toBe(text.length);
  });
});
