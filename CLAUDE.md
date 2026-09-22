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

# Type-check. Use the repo-pinned TypeScript, not bare `npx tsc` — that resolves a newer
# build which rejects this repo's own tsconfig (moduleResolution=node10, baseUrl removed)
# and reports TS5108/TS5102 instead of any real error.
./node_modules/.bin/tsc --noEmit
```

`vitest.config.ts` sets `environment: 'happy-dom'`. Its `typecheck.tsconfig` names a `tsconfig.test.json`
that is not in the repo, so `tsc --noEmit` — which covers `tests/` via the root `include` — is the real type gate.

## Architecture

```
src/
├── server.ts          # MCP server entry — registers all tools + resources
├── session/           # Session state (state.ts) + lifecycle (lifecycle.ts)
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
├── tools/             # One file per MCP tool (see Tool Pattern below); includes the Electron
│                       #   surface (electron-execute, electron-deeplink), mocking, and web extensions
├── resources/         # One file per MCP resource (see Recording below)
├── recording/         # step-recorder.ts (withRecording HOF) + code-generator.ts
├── scripts/           # Browser/mobile scripts executed via browser.execute() — no try/catch, raw data only
├── locators/          # Element detection, selector generation, XML parsing (mobile)
├── config/            # appium.config.ts — iOS/Android capability builders
├── utils/             # auth.ts, parse-args.ts, http-helpers.ts, zod-helpers.ts (coerceBoolean),
│                       #   docs-index.ts + docs-client.ts (docs corpus)
└── types/             # ToolDefinition, ResourceDefinition, RecordedStep interfaces
```

### Session State

Single active session model in `src/session/state.ts` — private state, read through `getBrowser()` or
`getState()`. The `SessionMetadata` interface (type, capabilities, `isAttached`, `provider`, plus the
provider-specific `region` / `tunnelName` / `tunnelHandle`) lives there; read it there rather than here.

Session lifecycle managed via `src/session/lifecycle.ts`:
- `registerSession()` — registers browser + metadata + history, handles transition sentinel; calls `provider.onSessionClose()` on orphaned sessions
- `handleSessionTransition()` — appends `__session_transition__` step to outgoing session
- `closeSession()` — terminates or detaches, marks endedAt, calls `provider.onSessionClose()`, cleans up maps

### Tool Pattern

All tools follow this structure — one file per tool under `src/tools/`, registered in `server.ts`
with `registerTool(myToolDefinition, myTool)`, or `withRecording('my_tool', myTool)` to record steps:

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
    return { isError: true, content: [{ type: 'text', text: `Error: ${e}` }] };
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

**Live page state (current session):** `wdio://session/current/` + `elements`, `accessibility`,
`screenshot`, `cookies`, `tabs`, `contexts`, `context`, `app-state`, `geolocation`, `capabilities`, `logs`.

- `elements` is viewport-only — use the `get_elements` tool with `inViewportOnly: false` for all
- `capabilities` are the *resolved* values the driver accepted, including provider defaults
- `logs` mixes crash logs with console output for the current session
- `contexts` / `context` / `app-state` are mobile-only

**Cloud tunnel binaries** (download URL + daemon start command):
- `wdio://browserstack/local-binary`
- `wdio://saucelabs/local-binary`
- `wdio://testmu/local-binary`
- `wdio://testingbot/local-binary` (single cross-platform Java JAR, requires Java 11+)

**WebdriverIO documentation:**
- `wdio://docs/index` — every docs page: title, source path, slug
- `wdio://docs/page/{slug}` — full markdown of one page (see Documentation Search below)

### Documentation Search

`query_docs` answers WebdriverIO API/config questions from the official docs corpus at
`https://webdriver.io/llms-full.txt` without injecting it into context.

- Fetched lazily, cached at `~/.wdio-mcp/llms-full.txt` with an `llms-full.meta.json` sidecar
  (`etag` + `fetchedAt`). Within 24 h the cache is used as-is; past that a conditional `GET` reuses
  the body on `304`. `WDIO_MCP_CACHE_DIR` relocates it (the tests rely on this).
- **Mechanism is test-enforced; do not restate it here.** `tests/utils/docs-index.test.ts` guards
  fence-aware chunking, one path per page, both `waitUntil` pages resolving apart, and `/docs/mcp/*`
  staying out of the top 3 of a framework question. Weights and factors live beside their constants
  in `src/utils/docs-index.ts`. Breaking any of them fails a test — read the test, not this file.
- **What tests cannot enforce, and therefore stays:** the stopword list is derived **grammatically,
  never by corpus frequency** — `i` looks like a content word on every frequency signal the index
  has, so a df threshold cannot find it, and `before`/`after`/`on`/`is`/`until`/`set` are excluded
  because they are WDIO API surface rather than English.
- **Keyword queries are the supported form, and the tool description is the interface.** It names the
  working examples, warns that a sentence dilutes ranking and that a word can collide with an
  unrelated page (`wire` → Wire Protocol), and points at both resources. Ranking changes must be
  reflected there — a mechanism the agent is not told about does not exist.
- A rare-term idf gate and a coverage multiplier were both **measured and rejected**; don't re-propose
  either without new measurements.
- Registered without `withRecording` (session-independent).
- The docs tests `it.skipIf` out when `~/.wdio-mcp/llms-full.txt` is absent, so a local green run
  means nothing unless the cache is populated. `.github/workflows/test.yml` curls the corpus before
  `pnpm test`, so CI does exercise the ranking gate.

### Build

- **tsup** bundles `src/server.ts` → `lib/server.js` (ESM), shebang preserved. `zod` and
  `@wdio/electron-service` are externalized — see `tsup.config.ts` for the current list.
- Three `bin` entries: `wdio-mcp` and `mcp` (both `lib/server.js`), plus `wdio-show-trace`
  (`lib/show-trace.js`, from `src/show-trace.ts`) — the bins point at `lib/`, so any of them needs
  `npm run bundle` first.
- Package subpath exports: `.` (server), `./snapshot` (`src/snapshot.ts`), `./trace` (`src/trace.ts`)

## Key Files

Only files whose purpose is not evident from the tree above.

| File | Purpose |
|------|---------|
| `src/providers/types.ts` | `SessionProvider` interface — `startTunnel()`, `onSessionClose()` lifecycle hooks |
| `src/providers/cloud/browserstack.provider.ts` | Tunnel lifecycle + session result marking via `onSessionClose()` |
| `src/providers/cloud/testingbot.provider.ts` | `tb:options` caps, single hub, form-encoded `test[success]` result marking, JAR tunnel via `testingbot-tunnel-launcher` |
| `src/providers/cloud/digitalai.provider.ts` | `digitalai:accessKey` (web) / `digitalai:options.accessKey` (mobile) caps, `<DIGITALAI_CLOUD_URL>/wd/hub`, mobile `deviceQuery`, `cloud:<id>` app refs; REST API via Bearer accessKey |
| `src/tools/session.tool.ts` | `start_session` (browser + mobile), `close_session` |
| `src/tools/get-elements.tool.ts` | `get_elements` — all elements with filtering + pagination |
| `src/tools/cloud-provider.tool.ts` | `list_apps`, `upload_app` — generalized across BrowserStack / Sauce Labs / TestMu / TestingBot and Digital.ai (Bearer auth) |
| `src/tools/query-docs.tool.ts` | `query_docs` — BM25 search over the WebdriverIO docs corpus |
| `src/utils/docs-index.ts` | Docs corpus fetch/cache, fence-aware chunking, path alignment, 3-field BM25 index + search |
| `src/utils/docs-client.ts` | Boundary layer for the docs corpus — resolves the cache dir and loads the index |
| `src/resources/docs.resource.ts` | `wdio://docs/index` + `wdio://docs/page/{slug}` |
| `src/scripts/get-interactable-browser-elements.ts` | Browser-context element detection |
| `src/recording/code-generator.ts` | Generates runnable WebdriverIO JS from `SessionHistory` |

## Gotchas

### Dev Reload vs Reconnect

`npm run dev` runs `tsx --watch` — code changes reload in-process, including ranking and search logic. Only tool/resource **schema changes** (Zod definitions, new tools, parameter additions) require an MCP client reconnect to re-advertise capabilities. Adding a resource counts even with no schema edit: the client caches the resource list at handshake, so new URIs stay invisible until reconnect. No need to rebundle or restart the dev server for implementation-only changes.

### Package Manager Is pnpm

`packageManager: pnpm@10.32.1` and only `pnpm-lock.yaml` at the root. The `npm run` scripts below work,
but installing a dependency with `npm install` forks the lockfile — use `pnpm add`.

### Console Output

`server.ts` reassigns `console.log/info/warn/debug` to `console.error` with a level prefix — chrome writes to
stdout, which corrupts the MCP stdio protocol. Do not remove those reassignments.

### Browser Scripts Must Be Self-Contained

`get-interactable-browser-elements.ts` executes in browser context via `browser.execute()`. Cannot use Node.js APIs or
external imports.

### Auto-Detach Behavior

Sessions created with `noReset: true` or without `appPath` automatically detach on close (don't terminate on Appium
server).

### MCP Resource URI Templates

The MCP SDK only supports path-segment templates `{param}` in resource URIs — NOT RFC 6570 query param syntax `{?param}`. Resources using `{?param}` silently return "Resource not found". Keep resources at fixed URIs; expose parameterised access via tools instead.

### Scripts vs Tools vs Resources

Computation logic belongs in `src/scripts/` (no try/catch, returns raw data). Tools wrap scripts with try/catch and return `{ isError: true, content: [...] }` on failure. Resources wrap scripts and set `mimeType` in the response.

### Error Handling

Tools return errors as text content, never throw. Keeps MCP protocol stable:

```typescript
catch (e) {
  return { isError: true, content: [{ type: 'text', text: `Error: ${e}` }] };
}
```

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

Unimplemented proposals only; shipped work is not listed here. See `docs/architecture/`:

- `multi-session-proposal.md` — parallel sessions for sub-agent coordination
- `interaction-sequencing-proposal.md` — sequencing model for tool interactions
- `trace-extraction-proposal.md` — extracting trace data to a standalone package

`providers/registry.ts` + `providers/cloud/` is the extension point for new cloud providers.
