import { describe, expect, it } from 'vitest';
import { mcpHint } from '../../src/session/hints';

describe('mcpHint', () => {
  it.each([
    ['snapshot', { interactive: true }, 'snapshot()'],
    ['snapshot', undefined, 'snapshot()'],
    ['snapshot', { interactive: false }, 'snapshot({"full":true})'],
    ['snapshot', { all: true }, 'snapshot({"full":true})'],
    ['snapshot', { interactive: true, scope: 'e3' }, 'snapshot({"scope":"e3"})'],
    ['snapshot', { scope: 'e3' }, 'snapshot({"scope":"e3"})'],
    ['snapshot', { interactive: false, scope: 'e3' }, 'snapshot({"full":true,"scope":"e3"})'],
    ['snapshot', { interactive: true, maxChars: 500, offset: 20, depth: 2 }, 'snapshot()'],
    ['find', { text: '<text>' }, 'snapshot({"find":"<text>"})'],
    ['frame', { target: '#pay' }, 'switch_frame({"selector":"#pay"})'],
    ['frame', { target: 'top' }, 'switch_frame()'],
    ['tabs', undefined, 'get_tabs()'],
    ['tabs', { sub: 'switch', arg: '1' }, 'switch_tab({"index":1})'],
    ['tabs', { sub: 'switch', arg: 'CDwindow-1' }, 'switch_tab({"handle":"CDwindow-1"})'],
    ['click', { target: 'aria/<name>' }, 'click_element({"selector":"aria/<name>"})'],
    ['fill', { target: 'e2', text: 'x' }, 'set_value({"selector":"e2","value":"x"})'],
    ['select', { target: 'e2', value: 'A' }, 'select_option({"selector":"e2","value":"A"})'],
    ['press', { keys: 'Enter' }, 'press_key({"keys":"Enter"})'],
    ['navigate', { url: 'https://a.test' }, 'navigate({"url":"https://a.test"})'],
    ['open', { target: 'chrome' }, 'start_session()'],
    ['close', undefined, 'close_session()'],
    ['exec', undefined, 'execute_script()'],
  ])('%s %j -> %s', (command, args, expected) => {
    expect(mcpHint(command, args)).toBe(expected);
  });

  describe('gaps', () => {
    it('keeps the bare command for actions without a tool', () => {
      expect(mcpHint('wait')).toBe('wait');
      expect(mcpHint('dialog', { sub: 'accept' })).toBe('dialog accept');
      expect(mcpHint('emulate', { sub: 'device' })).toBe('emulate device');
      expect(mcpHint('tabs', { sub: 'new' })).toBe('tabs new');
    });

    it('has no tool for the parent frame', () => {
      expect(mcpHint('frame', { target: 'parent' })).toBe('frame parent');
    });

    it('never prefixes commands with wdio session', () => {
      for (const command of ['snapshot', 'find', 'frame', 'tabs', 'click', 'wait', 'doctor', 'help']) {
        expect(mcpHint(command)).not.toContain('wdio session');
      }
    });
  });
});
