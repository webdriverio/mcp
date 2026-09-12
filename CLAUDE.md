# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run bundle      # Build: clean + tsup + make executable + create .tgz
npm run lint        # ESLint (--fix) + TypeScript type-checking (tsc --noEmit)
npm test            # Run all unit tests (vitest run; env: happy-dom)
npm run dev         # Development server (tsx --watch) — picks up code changes automatically; rebundle only needed for npm package changes
npm run dev:http    # Dev server with HTTP transport (for browser-based MCP clients)
npm start           # Run built server from lib/server.js
npm run start:http  # Built server with HTTP transport (for browser-based MCP clients)

# Single test file / focused run (vitest is not exposed via an npm script):
npx vitest run tests/tools/get-elements-tool.test.ts   # one file
npx vitest run -t "filter pattern"                      # tests matching a name
npx vitest tests/trace/                                 # watch mode for a directory
```

`vitest.config.ts` sets `environment: 'happy-dom'` and typechecks tests against `tsconfig.test.json`.

## Architecture

```
src/
├── server.ts          # MCP server entry — registers all tools + resources
├── session/           # Session state (state.ts), lifecycle (lifecycle.ts), element-refs.ts (eN ref store)
├── providers/         # SessionProvider implementations
│   ├── registry.ts    # getProvider() — routes to local or cloud provider
│   ├── local-browser.provider.ts  # Chrome/Firefox/Edge/Safari
│   ├── local-appium.provider.ts   # iOS/Android via Appium
│   └── cloud/
│       ├── browserstack.provider.ts  # BrowserStack (browser + App Automate)
│       ├── saucelabs.provider.ts     # Sauce Labs (browser + App Storage)
│       ├── testmu.provider.ts        # TestMu / LambdaTest (browser + mobile)
│       ├── testingbot.provider.ts    # TestingBot (browser + mobile + Storage)
│       └── digitalai.provider.ts     # Digital.ai Testing (browser + mobile; accessKey cap, deviceQuery)
├── trace/             # Playwright-compatible trace recording (recorder.ts, tool-mapping.ts, zip-writer.ts)
├── tools/             # One file per MCP tool (see Tool Pattern below)
├── resources/         # One file per MCP resource (see Recording below)
├── recording/         # step-recorder.ts (withRecording HOF) + code-generator.ts
├── config/            # appium.config.ts — iOS/Android capability builders
├── utils/             # parse-variables.ts, zod-helpers.ts (coerceBoolean)
└── types/             # ToolDefinition, ResourceDefinition, RecordedStep interfaces
```

### Session State

Single active session model in `src/session/state.ts`:

```typescript
// Private state — access via getState() or getBrowser()
export function getBrowser(): WebdriverIO.Browser { ... }
export function getState() { return state; }
export interface SessionMetadata {
  type: 'browser' | 'ios' | 'android';
  capabilities: Record<string, unknown>;
  isAttached: boolean;
  provider?: 'local' | 'browserstack' | 'saucelabs' | 'testmu' | 'testingbot' | 'digitalai';   // set at session start; used by lifecycle to call provider hooks
  tunnelHandle?: unknown;                 // opaque handle returned by provider.startTunnel(), passed back to onSessionClose()
}
```

Session lifecycle managed via `src/session/lifecycle.ts`:
- `registerSession()` — registers browser + metadata + history, handles transition sentinel; calls `provider.onSessionClose()` on orphaned sessions
- `handleSessionTransition()` — appends `__session_transition__` step to outgoing session
- `closeSession()` — terminates or detaches, marks endedAt, calls `provider.onSessionClose()`, cleans up maps

### Tool Pattern

All tools follow this structure:

```typescript
// 1. Definition with Zod schema
export const myToolDefinition: ToolDefinition = {
  name: 'my_tool',
  description: 'What it does',
  inputSchema: {
    param: z.string().describe('Parameter description'),
  },
};

// 2. Implementation
export const myTool: ToolCallback = async ({ param }: { param: string }) => {
  try {
    const browser = getBrowser();
    // ... implementation
    return { content: [{ type: 'text', text: `Result` }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e}` }] };
  }
};

// 3. Register in server.ts via the registerTool helper
registerTool(myToolDefinition, myTool);
```

### Recording

Selected tools are wrapped with `withRecording()` in `server.ts`. Steps accumulate in `state.sessionHistory` (keyed by sessionId).

MCP resources expose live session data — all at fixed URIs discoverable via ListResources:

**Session history:**
- `wdio://sessions` — index of all sessions
- `wdio://session/current/steps` — current session step log
- `wdio://session/current/code` — generated WebdriverIO JS for current session
- `wdio://session/{sessionId}/steps` — step log for any session (URI template)
- `wdio://session/{sessionId}/code` — generated JS for any session (URI template)

**Live page state (current session):**
- `wdio://session/current/elements` — interactable elements (viewport-only; use `get_elements` tool with `inViewportOnly: false` for all)
- `wdio://session/current/snapshot` — depth-indented page tree with `eN` element refs accepted by `click_element`, `set_value`, `tap_element`, `drag_and_drop`; viewport-only, with a footer reporting the element count and page load state (`get_snapshot` tool for the whole page)
- `wdio://session/current/accessibility` — accessibility tree (viewport-only; the unfiltered tree is ~10x the tokens)
- `wdio://session/current/screenshot` — screenshot (base64)
- `wdio://session/current/cookies` — browser cookies
- `wdio://session/current/tabs` — open browser tabs
- `wdio://session/current/contexts` — native/webview contexts (mobile)
- `wdio://session/current/context` — currently active context (mobile)
- `wdio://session/current/app-state` — mobile app state
- `wdio://session/current/geolocation` — device geolocation
- `wdio://session/current/capabilities` — resolved WebDriver capabilities for the active session
- `wdio://session/current/logs` — crash logs + browser console logs for the current session

**Cloud tunnel binaries** (download URL + daemon start command):
- `wdio://browserstack/local-binary`
- `wdio://saucelabs/local-binary`
- `wdio://testmu/local-binary`
- `wdio://testingbot/local-binary` (single cross-platform Java JAR, requires Java 11+)

### Build

- **tsup** bundles `src/server.ts` → `lib/server.js` (ESM)
- Shebang preserved for CLI execution
- `zod` and `@wdio/elements` externalized
- Two `bin` entries: `wdio-mcp` (the server) and `wdio-show-trace` (`src/show-trace.ts` — inspect a recorded trace)
- Package subpath exports: `.` (server), `./trace` (`src/trace.ts`). Element utilities are no longer re-exported — import them from `@wdio/elements` directly.

## Key Files

| File                                               | Purpose                                       |
|----------------------------------------------------|-----------------------------------------------|
| `src/server.ts`                                    | MCP server init, tool + resource registration |
| `src/session/state.ts`                             | Session state maps, `getBrowser()`, `getState()` |
| `src/session/lifecycle.ts`                         | `registerSession()`, `closeSession()`, session transitions |
| `src/session/element-refs.ts`                       | `eN` snapshot ref store + `withRefs()` resolver for action tools |
| `src/providers/registry.ts`                        | `getProvider()` — routes to local or cloud provider |
| `src/providers/types.ts`                           | `SessionProvider` interface — `startTunnel()`, `onSessionClose()` lifecycle hooks |
| `src/providers/cloud/browserstack.provider.ts`     | BrowserStack provider — tunnel lifecycle + session result marking via `onSessionClose()` |
| `src/providers/cloud/testingbot.provider.ts`       | TestingBot provider — `tb:options` caps, single hub, form-encoded `test[success]` result marking, JAR tunnel via `testingbot-tunnel-launcher` |
| `src/providers/cloud/digitalai.provider.ts`        | Digital.ai provider — `digitalai:accessKey` (web) / `digitalai:options.accessKey` (mobile) caps, `<DIGITALAI_CLOUD_URL>/wd/hub`, mobile `deviceQuery`, `cloud:<id>` app refs; REST API via Bearer accessKey |
| `src/tools/session.tool.ts`                        | `start_session` (browser + mobile), `close_session` |
| `src/tools/get-elements.tool.ts`                   | `get_elements` — all elements with filtering + pagination; delegates to `@wdio/elements` |
| `src/tools/cloud-provider.tool.ts`                 | `list_apps`, `upload_app` — generalized across BrowserStack / Sauce Labs / TestMu / TestingBot and Digital.ai (Digital.ai uses Bearer auth; registered in `server.ts`) |
| `src/resources/`                                   | All MCP resource definitions (one per URI)    |
| `src/resources/snapshot.resource.ts`               | `readSnapshot()` — `getSnapshot()` + ref-store write + count/page-state footer; backs both the snapshot resource and the `get_snapshot` tool |
| `src/tools/get-snapshot.tool.ts`                   | `get_snapshot` — same tree without the viewport filter |
| `src/recording/step-recorder.ts`                   | `withRecording(toolName, cb)` HOF — wraps tools for step logging |
| `src/recording/code-generator.ts`                  | Generates runnable WebdriverIO JS from `SessionHistory` |
| `src/utils/zod-helpers.ts`                         | `coerceBoolean` for client interop            |
| `tsup.config.ts`                                   | Build configuration                           |

## Gotchas

### Dev Reload vs Reconnect

`npm run dev` runs `tsx --watch` — code changes reload in-process. Only tool/resource **schema changes** (Zod definitions, new tools, parameter additions) require an MCP client reconnect to re-advertise capabilities. No need to rebundle or restart the dev server for implementation-only changes.

### Console Output

All console methods redirect to stderr via `console.error`. Chrome writes to stdout which corrupts MCP stdio protocol.

```typescript
// In server.ts - do not remove
console.log = (...args) => console.error('[LOG]', ...args);
console.info = (...args) => console.error('[INFO]', ...args);
console.warn = (...args) => console.error('[WARN]', ...args);
console.debug = (...args) => console.error('[DEBUG]', ...args);
```

### Auto-Detach Behavior

Sessions created with `noReset: true` or without `appPath` automatically detach on close (don't terminate on Appium
server).

### MCP Resource URI Templates

The MCP SDK only supports path-segment templates `{param}` in resource URIs — NOT RFC 6570 query param syntax `{?param}`. Resources using `{?param}` silently return "Resource not found". Keep resources at fixed URIs; expose parameterised access via tools instead.

### Element Detection Ownership

All element detection — browser DOM scripts, mobile page-source parsing, locator generation, accessibility tree and `getSnapshot()` — lives in the `@wdio/elements` package. This repo only wraps it: tools/resources call the package, add try/catch and set `mimeType`/TOON encoding. Do not re-implement detection here.

### Snapshot subpath removed

`src/snapshot.ts` and the `@wdio/mcp/snapshot` subpath export are gone — import `getInteractableBrowserElements`, `getBrowserAccessibilityTree`, `getMobileVisibleElements` from `@wdio/elements` instead.

### Espresso selectors unsupported

Upstream `packages/core/src/element-snapshot.ts` hardcodes `automationName` to `"uiautomator2"` for Android (`platform === "android" ? "uiautomator2" : "xcuitest"`), ignoring the session's `appium:automationName`. Espresso sessions get UiAutomator2-style selectors that won't resolve; not workaround-able via options.

### Snapshot refs vs selectors

`get_elements` and the accessibility resource return **selectors**. `wdio://session/current/snapshot` and the `get_snapshot` tool return a tree of **`eN` refs**; both write `src/session/element-refs.ts`, last snapshot wins. Action tools wrapped with `withRefs()` (in `server.ts`) resolve `eN` to a real selector *before* recording/tracing, so generated code and step logs always contain runnable selectors.

Refs are **positional** — upstream renumbers them on every snapshot (`buildSnapshot()` runs a fresh `e${counter++}` over interactive nodes in discovery order), so `e7` can mean one element in one snapshot and a different one in the next. `readSnapshot()` therefore stamps every ref in the tree with a generation (`e7@3`), and `resolveRef()` rejects a ref whose generation is not current. Never strip the suffix. Refs are per-process memory; `closeSession()` and orphan replacement drop the session's refs.

Do not try to validate a ref by comparing `SnapshotElement.tagName` against `getTagName()` — upstream's `tagName` carries the role-ish name (`textbox`, `searchbox`) whenever the role is more specific than the DOM tag, so the comparison fails on every form control.

### Error Handling

Tools return errors as text content, never throw. Keeps MCP protocol stable:

```typescript
catch (e) {
  return { content: [{ type: 'text', text: `Error: ${e}` }] };
}
```

## Adding New Tools

1. Create `src/tools/my-tool.tool.ts`
2. Export `myToolDefinition` (Zod schema) and `myTool` (ToolCallback)
3. Import and register in `src/server.ts` using the `registerTool` helper:
   ```typescript
   import { myToolDefinition, myTool } from './tools/my-tool.tool';
   registerTool(myToolDefinition, myTool);
   ```
   To wrap with recording: `registerTool(myToolDefinition, withRecording('my_tool', myTool));`

## Selector Syntax Reference

**Web:** CSS (`#id`, `.class`), XPath (`//button`), Text (`button=Exact`, `a*=Contains`)

**Mobile:**

- Accessibility ID: `~loginButton`
- Android UiAutomator: `android=new UiSelector().text("Login")`
- iOS Predicate: `-ios predicate string:label == "Login"`
- XPath: `//XCUIElementTypeButton[@label="Login"]`

## Environment

| Variable | Required for |
|----------|-------------|
| `BROWSERSTACK_USERNAME` | BrowserStack sessions + tools |
| `BROWSERSTACK_ACCESS_KEY` | BrowserStack sessions + tools |
| `SAUCE_USERNAME` | Sauce Labs sessions + App Storage tools |
| `SAUCE_ACCESS_KEY` | Sauce Labs sessions + App Storage tools |
| `TESTMU_USERNAME` | TestMu / LambdaTest sessions + tools |
| `TESTMU_ACCESS_KEY` | TestMu / LambdaTest sessions + tools |
| `TESTINGBOT_KEY` | TestingBot sessions + tools |
| `TESTINGBOT_SECRET` | TestingBot sessions + tools |
| `DIGITALAI_CLOUD_URL` | Digital.ai sessions + tools (cloud host, e.g. `https://cloud.example.com`) |
| `DIGITALAI_ACCESS_KEY` | Digital.ai sessions + tools |

## Planned Improvements

See `docs/architecture/` for proposals:

- `session-configuration-proposal.md` — Cloud provider pattern — BrowserStack, SauceLabs, TestMu, TestingBot, and Digital.ai implemented; `providers/registry.ts` + `providers/cloud/` is the extension point for new providers
- `multi-session-proposal.md` — Parallel sessions for sub-agent coordination
- `interaction-sequencing-proposal.md` — Sequencing model for tool interactions
- `trace-recording-and-replay.md` — Playwright-compatible trace recording (implemented in `src/trace/`)
- `trace-extraction-proposal.md` — Trace data extraction and analysis