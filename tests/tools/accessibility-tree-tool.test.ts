import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessibilityNode } from '../../src/scripts/get-browser-accessibility-tree';

vi.mock('../../src/scripts/get-browser-accessibility-tree', () => ({
  getBrowserAccessibilityTree: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getBrowser: vi.fn(() => ({ isAndroid: false, isIOS: false })),
  getState: vi.fn(() => ({
    browsers: new Map(),
    currentSession: null,
    sessionMetadata: new Map(),
    sessionHistory: new Map(),
  })),
}));

import { getBrowserAccessibilityTree } from '../../src/scripts/get-browser-accessibility-tree';
import { readAccessibilityTree } from '../../src/tools/get-accessibility-tree.tool';

type ReadFn = (args: Record<string, unknown>) => Promise<{ mimeType: string; text: string }>;
const callRead = readAccessibilityTree as unknown as ReadFn;

const mockGetTree = getBrowserAccessibilityTree as ReturnType<typeof vi.fn>;

const emptyState = {
  level: '' as string | number,
  disabled: '', checked: '', expanded: '',
  selected: '', pressed: '', required: '', readonly: '',
};

function makeNode(overrides: Partial<AccessibilityNode>): AccessibilityNode {
  return { role: 'button', name: 'Click', selector: '#btn', ...emptyState, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('column trimming', () => {
  it('omits state columns when all nodes have empty state', async () => {
    mockGetTree.mockResolvedValue([makeNode({})]);
    const result = await callRead({});
    const text = result.text;
    expect(text).not.toMatch(/\bdisabled\b/);
    expect(text).not.toMatch(/\bchecked\b/);
    expect(text).not.toMatch(/\blevel\b/);
  });

  it('includes level column when any node has a heading level', async () => {
    mockGetTree.mockResolvedValue([
      makeNode({ role: 'heading', name: 'Title', level: 2 }),
      makeNode({}),
    ]);
    const result = await callRead({});
    const text = result.text;
    expect(text).toMatch(/level/);
  });

  it('includes checked column when any node is checked', async () => {
    mockGetTree.mockResolvedValue([
      makeNode({ role: 'checkbox', name: 'Accept', checked: 'true' }),
      makeNode({}),
    ]);
    const result = await callRead({});
    const text = result.text;
    expect(text).toMatch(/checked/);
  });
});

describe('filtering', () => {
  it('filters out nodes with empty names', async () => {
    mockGetTree.mockResolvedValue([
      makeNode({ name: '' }),
      makeNode({ name: 'Visible' }),
    ]);
    const result = await callRead({});
    const text = result.text;
    expect(text).toContain('Visible');
    expect(text).toMatch(/total: 1/);
  });

  it('filters by role when roles param is provided', async () => {
    mockGetTree.mockResolvedValue([
      makeNode({ role: 'heading', name: 'Title' }),
      makeNode({ role: 'link', name: 'Click here' }),
    ]);
    const result = await callRead({ roles: ['heading'] });
    const text = result.text;
    expect(text).toContain('Title');
    expect(text).not.toContain('Click here');
  });
});

describe('pagination', () => {
  it('applies limit', async () => {
    mockGetTree.mockResolvedValue([
      makeNode({ name: 'A' }),
      makeNode({ name: 'B' }),
      makeNode({ name: 'C' }),
    ]);
    const result = await callRead({ limit: 2 });
    const text = result.text;
    expect(text).toMatch(/showing: 2/);
    expect(text).toMatch(/hasMore: true/);
  });

  it('applies offset', async () => {
    mockGetTree.mockResolvedValue([
      makeNode({ name: 'A' }),
      makeNode({ name: 'B' }),
    ]);
    const result = await callRead({ offset: 1, limit: 0 });
    const text = result.text;
    expect(text).toMatch(/showing: 1/);
    expect(text).toContain('B');
  });
});
