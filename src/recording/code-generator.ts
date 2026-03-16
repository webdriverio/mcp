// src/recording/code-generator.ts
import type { RecordedStep, SessionHistory } from '../types/recording';

/** Escape single quotes so generated JS string literals are valid. */
function escapeStr(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function generateStep(step: RecordedStep): string {
  if (step.tool === '__session_transition__') {
    const newId = (step.params.newSessionId as string) ?? 'unknown';
    return `// --- new session: ${newId} started at ${step.timestamp} ---`;
  }

  if (step.status === 'error') {
    return `// [error] ${step.tool}: ${formatParams(step.params)} — ${step.error ?? 'unknown error'}`;
  }

  const p = step.params;
  switch (step.tool) {
    case 'navigate':
      return `await browser.url('${escapeStr(p.url)}');`;
    case 'click_element':
      return `await $('${escapeStr(p.selector)}').click();`;
    case 'set_value':
      return `await $('${escapeStr(p.selector)}').setValue('${escapeStr(p.value)}');`;
    case 'scroll': {
      const scrollAmount = (p.direction as string) === 'down' ? (p.pixels as number) : -(p.pixels as number);
      return `await browser.execute(() => window.scrollBy(0, ${scrollAmount}));`;
    }
    case 'tap_element':
      if (p.selector !== undefined) {
        return `await $('${escapeStr(p.selector)}').click();`;
      }
      return `await browser.tap({ x: ${p.x}, y: ${p.y} });`;
    case 'swipe':
      return `await browser.execute('mobile: swipe', { direction: '${escapeStr(p.direction)}' });`;
    case 'drag_and_drop':
      if (p.targetSelector !== undefined) {
        return `await $('${escapeStr(p.sourceSelector)}').dragAndDrop($('${escapeStr(p.targetSelector)}'));`;
      }
      return `await $('${escapeStr(p.sourceSelector)}').dragAndDrop({ x: ${p.x}, y: ${p.y} });`;
    default:
      return `// [unknown tool] ${step.tool}`;
  }
}

function buildHeader(history: SessionHistory): string {
  const caps = JSON.stringify(history.capabilities, null, 2)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return `import { remote } from 'webdriverio';\nconst browser = await remote(\n${caps}\n);`;
}

export function generateCode(history: SessionHistory): string {
  const header = buildHeader(history);
  const steps = history.steps.map(generateStep).join('\n');
  return `${header}\n\n${steps}\n\nawait browser.deleteSession();`;
}
