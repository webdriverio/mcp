import { parse, type Pattern, type Program } from 'acorn';
import type { RecordedStep } from '../types/recording';

interface Edit { start: number; end: number; text: string }

const PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
} as const;

function boundNames(pattern: Pattern): string[] {
  switch (pattern.type) {
    case 'Identifier': return [pattern.name];
    case 'ObjectPattern': return pattern.properties.flatMap(p => boundNames(p.type === 'RestElement' ? p.argument : p.value));
    case 'ArrayPattern': return pattern.elements.flatMap(e => (e ? boundNames(e) : []));
    case 'RestElement': return boundNames(pattern.argument);
    case 'AssignmentPattern': return boundNames(pattern.left);
    default: return [];
  }
}

function applyEdits(source: string, edits: Edit[]): string {
  return edits
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce((out, { start, end, text }) => out.slice(0, start) + text + out.slice(end), source);
}

function hoistBody(body: string, program: Program): { names: string[]; code: string } {
  const names: string[] = [];
  const edits: Edit[] = [];
  const functions: string[] = [];
  const terminate = (end: number): Edit[] => (body[end - 1] === ';' ? [] : [{ start: end, end, text: ';' }]);

  for (const statement of program.body) {
    if (statement.type === 'VariableDeclaration') {
      const { declarations, kind } = statement;
      names.push(...declarations.flatMap(d => boundNames(d.id)));
      if (kind === 'var' && declarations.every(d => !d.init)) {
        edits.push({ start: statement.start, end: statement.end, text: '' });
        continue;
      }
      edits.push(...terminate(statement.end), { start: statement.start, end: declarations[0].start, text: '' });
      for (const d of declarations) {
        if (d.id.type !== 'Identifier') edits.push({ start: d.start, end: d.start, text: '(' }, { start: d.end, end: d.end, text: ')' });
        else if (!d.init && kind !== 'var') edits.push({ start: d.id.end, end: d.id.end, text: ' = undefined' });
      }
    } else if (statement.type === 'FunctionDeclaration' && statement.id) {
      names.push(statement.id.name);
      functions.push(`${statement.id.name} = ${body.slice(statement.start, statement.end)};`);
      edits.push({ start: statement.start, end: statement.end, text: '' });
    } else if (statement.type === 'ClassDeclaration' && statement.id) {
      names.push(statement.id.name);
      edits.push(...terminate(statement.end), { start: statement.start, end: statement.start, text: `${statement.id.name} = ` });
    }
  }
  return { names: [...new Set(names)], code: [...functions, applyEdits(body, edits)].join('\n') };
}

function wrap(body: string): string {
  return `await (async () => {\n${body}\n})();`;
}

/** Rewrites one recorded run_code body so its top-level bindings can be declared once for the whole script. */
export function hoistRunCodeBody(body: string): { names: string[]; code: string } {
  let program: Program;
  try {
    program = parse(body, PARSE_OPTIONS);
  } catch {
    return { names: [], code: body };
  }
  const hoisted = hoistBody(body, program);
  return { names: hoisted.names, code: wrap(hoisted.code) };
}

export function hoistRunCodeSteps(steps: RecordedStep[]): { steps: RecordedStep[]; names: string[] } {
  const names = new Set<string>();
  const rewritten = steps.map(step => {
    if (step.tool !== 'run_code' || !step.code?.length) return step;
    return {
      ...step,
      code: step.code.map(body => {
        const hoisted = hoistRunCodeBody(body);
        hoisted.names.forEach(name => names.add(name));
        return hoisted.code;
      }),
    };
  });
  return { steps: rewritten, names: [...names] };
}
