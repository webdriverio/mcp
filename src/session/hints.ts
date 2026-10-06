import type { HintFormatter } from '@wdio/session/agent';

type Args = Record<string, unknown>;

const text = (value: unknown) => typeof value === 'string' && value ? value : undefined;

function tool(name: string, args: Args = {}): string {
  const defined = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
  return `${name}(${Object.keys(defined).length ? JSON.stringify(defined) : ''})`;
}

/**
 * `@wdio/session` hints name its shell commands; here they are MCP tool calls.
 */
export const mcpHint: HintFormatter = (command, args = {}) => {
  switch (command) {
    case 'snapshot':
      return tool('snapshot', { full: args?.interactive === false || args?.all === true ? true : undefined, scope: text(args.scope) });
    case 'find':
      return tool('snapshot', { find: text(args.text) });
    case 'frame':
      return text(args.target) && args.target !== 'top' ? (args.target === 'parent' ? 'frame parent' : tool('switch_frame', { selector: args.target })) : tool('switch_frame');
    case 'tabs': {
      if (!args.sub) return tool('get_tabs');
      if (args.sub !== 'switch') return `tabs ${args.sub}`;
      const arg = text(args.arg);
      return tool('switch_tab', /^\d+$/.test(arg ?? '') ? { index: Number(arg) } : { handle: arg });
    }
    case 'click':
      return tool('click_element', { selector: text(args.target) });
    case 'fill':
      return tool('set_value', { selector: text(args.target), value: text(args.text) });
    case 'select':
      return tool('select_option', { selector: text(args.target), value: text(args.value) });
    case 'press':
      return tool('press_key', { keys: text(args.keys) });
    case 'navigate':
      return tool('navigate', { url: text(args.url) });
    case 'open':
      return tool('start_session');
    case 'close':
      return tool('close_session');
    case 'exec':
      return tool('execute_script');
    default:
      return `${command}${text(args.sub) ? ` ${args.sub}` : ''}`;
  }
};
