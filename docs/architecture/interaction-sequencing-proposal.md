# Interaction Sequencing Architecture Proposal

> **Status**: Draft
> **Date**: 2026-02-05
> **Goal**: Reduce round-trips for multi-action workflows and provide intelligent state change detection

---

## Problem Statement

### Current Flow (Inefficient)

A simple login requires 3+ tool calls:

```
AI → set_value(#username, "user")  → "Set value"        → AI
AI → set_value(#password, "pass")  → "Set value"        → AI
AI → click_element(#submit)        → "Clicked element"  → AI
AI → get_visible_elements()        → [elements...]      → AI
```

**Issues:**

1. **Wasted round-trips** — The AI already knows the full sequence; intermediate responses carry no information
2. **No state feedback** — Tools return "Clicked element" but not whether anything changed
3. **Manual polling** — AI must call `get_visible_elements` to see what happened
4. **Latency** — Each round-trip adds network + inference latency

### Desired Flow

```
AI → execute_sequence([
       { action: "set_value", selector: "#username", value: "user" },
       { action: "set_value", selector: "#password", value: "pass" },
       { action: "click_element", selector: "#submit" }
     ])
   → { completed: 3, stateChange: { navigation: "/login" → "/dashboard", appeared: [...] } }
   → AI
```

One round-trip. State delta computed automatically.

---

## Proposed Design

### New Tool: `execute_sequence`

Located in `src/tools/interaction.tool.ts`

```typescript
interface Action {
  action: 'set_value' | 'click_element' | 'tap_element' | 'navigate' | 'scroll' | 'swipe';
  selector?: string;
  value?: string;
  url?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  pixels?: number;
}

interface SequenceOptions {
  actions: Action[];
  sessionId?: string;           // For future multi-session support
  stabilityMs?: number;         // How long state must be unchanged (default: 500)
  pollIntervalMs?: number;      // How often to check stability (default: 100)
  timeoutMs?: number;           // Max wait for stability (default: 5000)
  verbose?: boolean;            // Return per-action results (default: false)
}
```

### State Delta Structure

```typescript
interface StateDelta {
  url?: { from: string; to: string };
  title?: { from: string; to: string };
  appeared: ElementSummary[];
  disappeared: ElementSummary[];
  changed: ElementChange[];
}

interface ElementSummary {
  selector: string;
  tagName: string;
  text?: string;          // Truncated to ~50 chars
}

interface ElementChange {
  selector: string;
  field: 'textContent' | 'value' | 'className';
  from: string;
  to: string;
}
```

### Response Structure

```typescript
interface SequenceResult {
  completed: number;                    // How many actions succeeded
  failed?: {
    index: number;
    action: string;
    error: string;
  };
  stateChange: StateDelta | null;       // null if no changes detected
  stabilityWaitMs: number;              // How long we waited for stability

  // Only if verbose: true
  steps?: {
    action: string;
    result: 'ok' | 'error';
    durationMs: number;
  }[];
}
```

---

## Stability Detection Algorithm

### Why Stability Matters

After clicking a button, the page might:
- Navigate (URL change)
- Show a loading spinner
- Fetch data and render new elements
- Display an error message

We need to wait for the page to "settle" before computing the final delta.

### Algorithm

```
1. Capture "before" state (elements, URL, title)
2. Execute all actions in sequence
3. Enter stability loop:
   a. Capture current state
   b. Compare to previous capture (using key signals)
   c. If different → reset stability timer, goto 3a
   d. If same → increment stability counter
   e. If stable for stabilityMs → exit loop
   f. If total time > timeoutMs → exit loop (timeout)
4. Capture "after" state (full element list)
5. Compute delta between "before" and "after"
6. Return result
```

### Key Signals for Stability Check (Fast Path)

Instead of comparing all elements on every poll (expensive), check key signals:

```typescript
interface StateSignature {
  url: string;
  title: string;
  elementCount: number;
  hasLoadingIndicator: boolean;  // .loading, [aria-busy="true"], .spinner, etc.
  documentReady: boolean;        // document.readyState === 'complete'
  pendingRequests: number;       // If using performance observer
}
```

If signature unchanged for `stabilityMs`, the page is stable.

### Loading Indicator Detection

```typescript
const LOADING_SELECTORS = [
  '.loading',
  '.spinner',
  '[aria-busy="true"]',
  '[data-loading="true"]',
  '.skeleton',
  '[class*="loading"]',
  '[class*="spinner"]',
];
```

If any loading indicator is visible, page is not stable (continue waiting).

---

## Implementation Plan

### File Structure

```
src/
├── tools/
│   └── interaction.tool.ts      # New file: execute_sequence tool
├── utils/
│   ├── state-capture.ts         # Capture page state (elements, URL, title)
│   ├── state-diff.ts            # Compute delta between two states
│   └── stability-detector.ts    # Polling loop for stability detection
└── types/
    └── interaction.types.ts     # Shared types for sequence/delta
```

### Phase 1: Core Sequencing

1. Create `interaction.tool.ts` with basic `execute_sequence`
2. Implement action dispatch (reuse existing tool logic)
3. Capture before/after state using `getVisibleElements`
4. Compute simple delta (appeared/disappeared by selector)

### Phase 2: Stability Detection

1. Implement `stability-detector.ts` with polling loop
2. Add loading indicator detection
3. Add configurable timeouts
4. Handle edge cases (infinite loading, rapid changes)

### Phase 3: Enriched Feedback

1. Add `changed` detection (same element, different content)
2. Add URL/title change tracking
3. Add `verbose` mode for debugging
4. Optimize performance (signature-based fast path)

### Phase 4: Multi-Session Support

1. Add `sessionId` parameter to target specific sessions
2. Enable parallel sequences across sessions
3. Coordinate with sub-agent architecture

---

## Usage Examples

### Basic Login

```typescript
execute_sequence({
  actions: [
    { action: 'set_value', selector: '#email', value: 'user@example.com' },
    { action: 'set_value', selector: '#password', value: 'secret123' },
    { action: 'click_element', selector: '#login-button' }
  ]
})
```

Response:
```json
{
  "completed": 3,
  "stateChange": {
    "url": { "from": "/login", "to": "/dashboard" },
    "appeared": [
      { "selector": "#welcome-message", "tagName": "h1", "text": "Welcome back!" },
      { "selector": "#user-menu", "tagName": "nav" }
    ],
    "disappeared": [
      { "selector": "#login-form", "tagName": "form" }
    ],
    "changed": []
  },
  "stabilityWaitMs": 650
}
```

### Form with Validation Error

```typescript
execute_sequence({
  actions: [
    { action: 'set_value', selector: '#email', value: 'invalid-email' },
    { action: 'click_element', selector: '#submit' }
  ]
})
```

Response:
```json
{
  "completed": 2,
  "stateChange": {
    "appeared": [
      { "selector": ".error-message", "tagName": "div", "text": "Please enter a valid email" }
    ],
    "disappeared": [],
    "changed": [
      { "selector": "#email", "field": "className", "from": "input", "to": "input error" }
    ]
  },
  "stabilityWaitMs": 520
}
```

### Action Failure Mid-Sequence

```typescript
execute_sequence({
  actions: [
    { action: 'set_value', selector: '#username', value: 'test' },
    { action: 'click_element', selector: '#nonexistent-button' },
    { action: 'set_value', selector: '#other-field', value: 'never reached' }
  ]
})
```

Response:
```json
{
  "completed": 1,
  "failed": {
    "index": 1,
    "action": "click_element",
    "error": "Element not found: #nonexistent-button"
  },
  "stateChange": {
    "changed": [
      { "selector": "#username", "field": "value", "from": "", "to": "test" }
    ]
  },
  "stabilityWaitMs": 100
}
```

### Verbose Mode for Debugging

```typescript
execute_sequence({
  actions: [
    { action: 'navigate', url: 'https://example.com' },
    { action: 'click_element', selector: '#menu-toggle' },
    { action: 'click_element', selector: '#settings-link' }
  ],
  verbose: true
})
```

Response:
```json
{
  "completed": 3,
  "stateChange": { "url": { "from": "/", "to": "/settings" }, ... },
  "stabilityWaitMs": 1200,
  "steps": [
    { "action": "navigate", "result": "ok", "durationMs": 450 },
    { "action": "click_element", "result": "ok", "durationMs": 85 },
    { "action": "click_element", "result": "ok", "durationMs": 92 }
  ]
}
```

---

## Open Questions

### 1. Should stability detection be configurable per-action?

Some actions (like `set_value`) rarely cause async changes. Could skip stability check for them:

```typescript
{ action: 'set_value', selector: '#name', value: 'test', skipStability: true }
```

**Concern**: Adds complexity. Maybe just rely on the final stability check.

### 2. How to handle infinite loading states?

Options:
- Hard timeout (current approach) — returns partial delta
- Detect specific loading patterns — report "page still loading"
- Let AI decide — return `{ stable: false, reason: 'loading indicator visible' }`

**Recommendation**: Timeout with diagnostic info about why we timed out.

### 3. Should delta include off-screen elements?

Current `getVisibleElements` filters to viewport by default. For delta:
- Viewport only = might miss elements that scrolled in/out
- Full page = more accurate but larger payload

**Recommendation**: Full page for delta computation, but truncate to top N appeared/disappeared.

### 4. Performance: Full diff vs. key signals

Two comparison strategies:
- **Full diff**: Compare all elements every poll (accurate, expensive)
- **Key signals**: Compare signature only during polling, full diff only at end (fast, might miss rapid changes)

**Recommendation**: Key signals for polling, full diff once at end.

### 5. What about conditional actions?

Should we support:
```typescript
{ action: 'click_element', selector: '#cookie-banner', optional: true }
```

**Concern**: Scope creep. The AI can handle conditionals itself. Keep the tool simple.

---

## Compatibility

### Existing Tools

`execute_sequence` complements existing tools:
- Simple single actions still use `click_element`, `set_value`, etc.
- Complex workflows use `execute_sequence`
- No breaking changes to existing tools

### Mobile Support

Works identically for mobile sessions:
```typescript
execute_sequence({
  actions: [
    { action: 'tap_element', selector: '~loginButton' },
    { action: 'set_value', selector: '~usernameField', value: 'test' },
    { action: 'swipe', direction: 'up' }
  ]
})
```

### Multi-Session (Future)

When multi-session support lands:
```typescript
execute_sequence({
  sessionId: 'user-a',
  actions: [...]
})
```

---

## References

- [WebDriverIO waitUntil](https://webdriver.io/docs/api/browser/waitUntil/)
- [Playwright Auto-Waiting](https://playwright.dev/docs/actionability)
- [Testing Library waitFor](https://testing-library.com/docs/dom-testing-library/api-async/#waitfor)