# `@wdio/trace` — Extracting Trace Recording into a Standalone Package

**Status:** Proposal — not yet implemented.

---

## Problem

Trace recording currently lives inside the MCP server (`src/trace/`) and is coupled to MCP-specific concepts:

- `withTrace()` wraps `ToolCallback` (an MCP SDK type) — tracing is only possible for MCP tool calls
- `captureScreenshot()` reaches into `getBrowser()` and `getState()` — MCP session singletons
- The tool-mapping layer (`tool-mapping.ts`) maps MCP tool names to Playwright actions — not WebdriverIO command names
- Only the 10 tools explicitly registered in `TOOL_MAP` get traced; any other browser command is invisible

This means tracing is unavailable to plain WebdriverIO scripts, standalone `remote()` usage, and any testrunner suite. The trace format itself (Playwright v8 NDJSON zip, playable at player.vibium.dev) is completely generic — only the recording layer is unnecessarily MCP-specific.

---

## Goal

Extract tracing into a standalone `@wdio/trace` package that hooks into WebdriverIO's native `beforeCommand`/`afterCommand` mechanism. Any WebdriverIO script — testrunner, standalone `remote()`, or MCP — gets Playwright-compatible trace recording without manual wrapping.

```ts
// Plain WebdriverIO script — tracing enabled with three lines
import { createTracer } from '@wdio/trace'
import { sharpEncoder } from '@wdio/trace/sharp'
import { remote } from 'webdriverio'

const tracer = createTracer({ outputDir: '.trace', encoder: sharpEncoder() })
const browser = await remote({
  capabilities: { browserName: 'chrome' },
  ...tracer.hooks,
})

await browser.url('https://example.com')
await browser.$('button=Accept').click()
await browser.deleteSession()
// → .trace/2026-05-14T09-30-00-000Z-abc123.zip written automatically
```

---

## WebdriverIO Hook Mechanism

WebdriverIO wraps every command with `wrapCommand()` (in `@wdio/utils`), which fires `beforeCommand`/`afterCommand` hooks around every execution. These are available in both testrunner and standalone `remote()` mode by passing them to the options object:

```ts
const browser = await remote({
  capabilities: { ... },
  beforeCommand(commandName, args) { /* fires before every command */ },
  afterCommand(commandName, args, result, error) { /* fires after every command */ },
})
```

A guard (`inCommandHook`) prevents recursive invocations when hooks themselves call browser commands.

This replaces the need for `withTrace()` entirely. Every `browser.url()`, `element.click()`, `element.setValue()`, `browser.execute()` — and any future command — fires these hooks automatically.

---

## Public API

### `createTracer(options)`

```ts
import { createTracer } from '@wdio/trace'

const tracer = createTracer({
  outputDir: '.trace',             // where to write the zip (default: '.trace')
  sessionType: 'browser',          // 'browser' | 'ios' | 'android' (default: 'browser')
  title: 'My test session',        // optional — shown in trace viewer header
  viewport: { width: 1920, height: 1080 },  // optional override
  encoder: sharpEncoder({ quality: 60 }),   // optional — see Screenshot Encoding below
})
```

Returns a `Tracer` object:

```ts
interface Tracer {
  hooks: {
    beforeCommand(commandName: string, args: unknown[]): Promise<void>
    afterCommand(commandName: string, args: unknown[], result: unknown, error?: Error): Promise<void>
  }
  stop(): Promise<Buffer>  // finalize and return zip buffer (without writing to disk)
}
```

### Usage with `remote()`

```ts
const browser = await remote({
  capabilities: { browserName: 'chrome' },
  ...tracer.hooks,
})
```

### Usage in testrunner (`wdio.conf.ts`)

```ts
const tracer = createTracer({ outputDir: '.trace' })

export const config = {
  capabilities: [{ browserName: 'chrome' }],
  beforeCommand: tracer.hooks.beforeCommand,
  afterCommand: tracer.hooks.afterCommand,
}
```

---

## Session Lifecycle

**Auto-start:** The tracer lazily initializes on the first `beforeCommand` call. At that point `this` (the browser or element context) provides `this.capabilities` — `browserName`, platform, viewport. No explicit `startTrace()` call needed.

**Auto-finalize:** When `commandName === 'deleteSession'` is seen in `beforeCommand`, the tracer captures a final screenshot. In `afterCommand` for `deleteSession`, it drains the screenshot chain, builds the zip, and writes it to `outputDir`. The filename is `{ISO-timestamp}-{sessionId-prefix}.zip`.

**Manual stop:** `tracer.stop()` is available for cases where the caller wants the zip in memory (e.g., the MCP server writing to a custom location, or a test that uploads the zip to a reporting service). Calling `stop()` also prevents the auto-finalize from writing a second zip.

**Ungraceful exits:** If `deleteSession` never fires (crash, test timeout), the trace is lost. Users should call `tracer.stop()` in a `finally` block for critical traces.

---

## Command Mapping

The current `tool-mapping.ts` maps MCP tool names (`click_element`, `set_value`) to Playwright trace actions. The new package maps raw WebdriverIO command names instead.

Whether a command is a "browser" or "element" command is determined from `this.elementId` in the hook context — if it is truthy, it is an element command and `this.selector` gives the selector string.

```ts
// command-mapping.ts

const BROWSER_COMMANDS: Record<string, { class: string; method: string }> = {
  url:           { class: 'Page',    method: 'navigate' },
  execute:       { class: 'Page',    method: 'evaluate' },
  executeAsync:  { class: 'Page',    method: 'evaluate' },
  scroll:        { class: 'Page',    method: 'scroll' },
  newWindow:     { class: 'Browser', method: 'newContext' },
}

const ELEMENT_COMMANDS: Record<string, { class: string; method: string }> = {
  click:               { class: 'Element', method: 'click' },
  doubleClick:         { class: 'Element', method: 'dblclick' },
  setValue:            { class: 'Element', method: 'fill' },
  addValue:            { class: 'Element', method: 'type' },
  clearValue:          { class: 'Element', method: 'clear' },
  dragAndDrop:         { class: 'Element', method: 'dragTo' },
  selectByVisibleText: { class: 'Element', method: 'selectOption' },
  touchAction:         { class: 'Element', method: 'tap' },
}
```

The mapping acts as an allowlist — only commands present in either map produce `before`/`after` trace events. Read-only commands (`getTitle`, `getText`, `isDisplayed`, `takeScreenshot`, etc.) are silently skipped. This keeps the action timeline clean.

---

## Screenshot Encoding

`sharp` is a native binary (~30 MB installed). Making it a hard dependency would be a significant cost for consumers who only need the trace format, not JPEG compression.

**Strategy: pluggable encoder, `sharp` as optional.**

```ts
// No encoder (default) — stores raw PNG, no compression
const tracer = createTracer({ outputDir: '.trace' })

// With sharp encoder — JPEG at quality 60 (current MCP behavior)
import { sharpEncoder } from '@wdio/trace/sharp'
const tracer = createTracer({
  outputDir: '.trace',
  encoder: sharpEncoder({ quality: 60 }),
})
```

The encoder interface:

```ts
interface ScreenshotEncoder {
  encode(pngBase64: string): Promise<{
    buffer: Buffer
    width: number
    height: number
    ext: 'jpeg' | 'png'
  }>
}
```

`@wdio/trace/sharp` is a separate package export entry point. It has `sharp` as a peer dependency (optional). Importing it when `sharp` is not installed throws a clear actionable error.

---

## Timestamp Trick (Preserved)

The `lastAfterEndTime` pattern from the current implementation is preserved. Each `screencast-frame` event is stamped at the *previous* action's `endTime`, not the current time. This causes the Vibium player to associate each screenshot with the action that produced the screen state, rather than the action about to fire.

```
prev.endTime  ← screencast-frame timestamp stamped here
      │
      │   [screenshot captured — shows settled state after prev action]
      │
curr.startTime
      │
      │   [action executes]
      │
curr.endTime  ← next frame will be stamped here
```

With hooks this works naturally: `afterCommand` writes `endTime` before the next `beforeCommand` fires (WDIO awaits hooks sequentially).

---

## Package Structure

```
packages/trace/
  package.json          # name: @wdio/trace
  tsconfig.json
  tsup.config.ts
  src/
    index.ts            # Public API: createTracer, types
    tracer.ts           # Core: beforeCommand/afterCommand logic, lifecycle
    command-mapping.ts  # WDIO command names → Playwright trace actions
    types.ts            # TraceSession, TraceEvent, etc. (moved from src/trace/)
    state.ts            # Session factory, monotonic clock (moved, decoupled)
    zip-writer.ts       # buildTraceZip (moved as-is)
    sharp.ts            # sharpEncoder() — subpath export, sharp as peer dep
  tests/
    tracer.test.ts
    command-mapping.test.ts
    state.test.ts
    zip-writer.test.ts
```

**`package.json` key fields:**

```json
{
  "name": "@wdio/trace",
  "type": "module",
  "exports": {
    ".":       { "import": "./lib/index.js",  "types": "./lib/index.d.ts" },
    "./sharp": { "import": "./lib/sharp.js",  "types": "./lib/sharp.d.ts" }
  },
  "dependencies": {
    "yazl": "^3.3.1"
  },
  "peerDependencies": {
    "webdriverio": "^9.27.0",
    "sharp": "^0.34.0"
  },
  "peerDependenciesMeta": {
    "sharp":      { "optional": true },
    "webdriverio": { "optional": true }
  }
}
```

`webdriverio` is a peer dep for types only — the package does not import from it at runtime.

---

## Monorepo Setup

The current repo is not a monorepo. To host both the MCP server and `@wdio/trace`:

1. Add `packages: ['packages/*']` to `pnpm-workspace.yaml`
2. Create `packages/trace/` with the structure above
3. The MCP server stays at the repo root (or moves to `packages/mcp/`)
4. Add `"@wdio/trace": "workspace:*"` to the MCP server's `package.json`

---

## MCP Server Migration

After extraction, the MCP server changes are surgical:

### What gets deleted

| File | Reason |
|------|--------|
| `src/trace/recorder.ts` | Replaced by `@wdio/trace` hooks |
| `src/trace/tool-mapping.ts` | Replaced by `command-mapping.ts` in `@wdio/trace` |
| `withTrace` call in `src/server.ts` | `instrument()` simplifies to just `withRecording()` |

### What changes

**`src/tools/session.tool.ts`** — replace `startTrace()` / `recordInitialNavigation()` with:

```ts
import { createTracer } from '@wdio/trace'
import { sharpEncoder } from '@wdio/trace/sharp'

// Inside startBrowserSession / startMobileSession / attachBrowserSession:
const tracer = args.trace
  ? createTracer({
      outputDir: join(process.cwd(), '.trace'),
      sessionType,                           // 'browser' | 'ios' | 'android'
      title: browserDisplayNames[browser],
      encoder: sharpEncoder({ quality: 60 }),
    })
  : undefined

const wdioBrowser = await remote({
  ...connectionConfig,
  capabilities: mergedCapabilities,
  ...(tracer?.hooks ?? {}),
})

// Store on metadata so lifecycle can call tracer.stop() if needed
metadata.tracer = tracer
```

**`src/session/lifecycle.ts`** — remove the manual trace export block (lines 88–106). The tracer auto-finalizes on `deleteSession`. If manual control is needed (e.g., custom output path):

```ts
if (metadata?.tracer) {
  const zipBuffer = await metadata.tracer.stop()
  const outPath = join(process.cwd(), '.trace', `${timestamp}-${sessionId.slice(0, 8)}.zip`)
  writeFileSync(outPath, zipBuffer)
}
```

**`src/server.ts`** — `instrument()` simplifies:

```ts
// Before
const instrument = (name, cb) => withTrace(name, withRecording(name, cb))

// After
const instrument = (name, cb) => withRecording(name, cb)
```

### What stays in MCP server

| File | Notes |
|------|-------|
| `src/trace/types.ts` | Re-export from `@wdio/trace` or keep as alias |
| `src/trace/state.ts` | Re-export from `@wdio/trace` or keep as alias |
| `src/trace/zip-writer.ts` | Re-export from `@wdio/trace` or keep as alias |
| `src/show-trace.ts` | Trace viewer launcher — stays in MCP, could move later |
| `src/trace.ts` barrel | Update to re-export from `@wdio/trace` |

---

## What a Plain Script Gets

With this extraction, a developer running a vanilla WebdriverIO script gets full Playwright-compatible traces with zero MCP involvement:

```ts
import { createTracer } from '@wdio/trace'
import { sharpEncoder } from '@wdio/trace/sharp'
import { remote } from 'webdriverio'

const tracer = createTracer({
  outputDir: '.trace',
  sessionType: 'android',
  encoder: sharpEncoder({ quality: 60 }),
})

const browser = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  capabilities: {
    platformName: 'Android',
    'appium:deviceName': 'emulator-5554',
    'appium:app': '/path/to/app.apk',
  },
  ...tracer.hooks,
})

await browser.$('~loginButton').click()
await browser.$('~usernameField').setValue('testuser')
await browser.deleteSession()
// → .trace/2026-05-14T09-30-00-000Z-session.zip
```

Open the zip at player.vibium.dev — full action timeline, screenshots, error annotations.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Hook composition — user also needs `beforeCommand` | Document: compose manually or use an array if WDIO supports it |
| `deleteSession` not firing (crash) | `tracer.stop()` escape hatch; document `finally` pattern |
| Command mapping gaps | Allowlist approach — unmapped commands silently skipped; debug log for unrecognized names |
| `sharp` not installed when `sharpEncoder` imported | Clear error message with install instructions |
| Mobile `browserName` must be `'chromium'` for Vibium | Handled inside `createTracer` when `sessionType` is `'ios'` or `'android'` |
