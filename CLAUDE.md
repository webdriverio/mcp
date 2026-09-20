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

`vitest.config.ts` sets `environment: 'happy-dom'` and typechecks tests against `tsconfig.test.json`.

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
├── tools/             # One file per MCP tool (see Tool Pattern below)
├── resources/         # One file per MCP resource (see Recording below)
├── recording/         # step-recorder.ts (withRecording HOF) + code-generator.ts
├── scripts/           # Browser/mobile scripts executed via browser.execute() — no try/catch, raw data only
├── locators/          # Element detection, selector generation, XML parsing (mobile)
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
- `wdio://session/current/accessibility` — accessibility tree
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

**WebdriverIO documentation:**
- `wdio://docs/index` — every docs page: title, source path, slug
- `wdio://docs/page/{slug}` — full markdown of one page (see Documentation Search below)

### Documentation Search

`query_docs` answers WebdriverIO API/config questions from the official docs corpus at
`https://webdriver.io/llms-full.txt` (~2.97 MB, ~438 pages) without injecting it into context.

- Corpus is fetched lazily on first query and cached at `~/.wdio-mcp/llms-full.txt` with an
  `llms-full.meta.json` sidecar holding `etag` + `fetchedAt`. Within 24 h the cache is used as-is;
  past that it revalidates with a conditional `GET` and reuses the body on `304`.
- Set `WDIO_MCP_CACHE_DIR` to relocate the cache (used by the tests; also useful when `$HOME` is read-only).
- `chunkCorpus` splits on page headings and ignores `#` lines inside fenced code blocks. Fences are
  tracked by backtick-run length and an info string is allowed, but a table-padded fence line — the
  ones ending in a `|`, present ~69 times in the corpus — may only *close* a fence, never open one.
  Getting this rule wrong produces hundreds of phantom pages.
- **Page paths come from positional alignment, not a title map.** Corpus pages appear in TOC order,
  but 21 of 438 have no TOC entry, so a title→path map cannot address a page — it handed both
  `waitUntil` pages both paths. `resolvePagePaths` walks both sequences in step and gives each page
  exactly one path. A desync stalls the pointer and strands every later entry, so the failure is
  massive and loud; it degrades to `console.error` rather than throwing, and the test suite pins it.
- **Three BM25 fields**, each with its own `lengths`/`avgdl`: whole tokens (weight 1.0), camelCase
  sub-segments ≥3 chars (0.4), and page title + section trail (1.0). The third field is why a page
  *titled* `click` outranks prose that merely mentions it. Field 0 indexes whole tokens only, so a
  query term is never looked up in a field that never held that form of it.
- **Queries are filtered to content words** by `queryTerms`, which drops closed-class English
  function words before scoring, falling back to the raw tokens if that would empty the query.
  `before`/`after`/`on`/`is`/`until`/`set` are struck from the list because they are WDIO API
  surface, not English. The list is derived grammatically, not by frequency: `i` has df 59 and
  idf 2.299, so no corpus statistic distinguishes it from a content word.
- **Keyword queries are the supported form, and the tool description says so.** Agents read that
  description, so it is the interface: it names the working examples (`appium setup`, `devtools
  trace.zip`, `allure reporter`), warns that a sentence dilutes the ranking and that a word can
  collide with an unrelated page (`wire` matches Wire Protocol, `tracing` is near-unique at df 3 and
  drags in Lighthouse), and points at the two resources. Changing ranking behaviour means changing
  that description too — a mechanism the agent is not told about does not exist.
- A coverage multiplier over content words was implemented, measured, and removed: it fixed neither
  failing query and demoted pages that answer the question with a single term. An idf-ratio gate was
  designed and killed before implementation — in a sentence, the max-idf term is usually the noise
  (`wire` 3.415, `i` 2.299), so such a gate anchors on the wrong token.
- `/docs/mcp/*` pages score at 0.25 unless the query contains `mcp` — this server's own docs would
  otherwise outrank framework pages for generic questions.
- The tool is session-independent, so it is registered without `withRecording`.
- Two resources read the same corpus: `wdio://docs/index` lists every TOC entry as title, path and
  slug; `wdio://docs/page/{slug}` returns one full page. The slug encodes the path with `~` in place
  of `/` (`docs~appium.md`), because MCP resource templates match a single path segment. `~` is
  RFC 3986 unreserved and appears in no path, so the mapping is injective by construction.
- The ranking and alignment assertions in `tests/utils/docs-index.test.ts` need the real corpus and
  `it.skipIf` out when `~/.wdio-mcp/llms-full.txt` is absent. A green run without that cache proves
  nothing about retrieval — populate it (`WDIO_MCP_CACHE_DIR` to relocate) before trusting one.

### Build

- **tsup** bundles `src/server.ts` → `lib/server.js` (ESM)
- Shebang preserved for CLI execution
- `zod` externalized
- Two `bin` entries: `wdio-mcp` (the server) and `wdio-show-trace` (`src/show-trace.ts` — inspect a recorded trace)
- Package subpath exports: `.` (server), `./snapshot` (`src/snapshot.ts`), `./trace` (`src/trace.ts`)

## Key Files

| File                                               | Purpose                                       |
|----------------------------------------------------|-----------------------------------------------|
| `src/server.ts`                                    | MCP server init, tool + resource registration |
| `src/session/state.ts`                             | Session state maps, `getBrowser()`, `getState()` |
| `src/session/lifecycle.ts`                         | `registerSession()`, `closeSession()`, session transitions |
| `src/providers/registry.ts`                        | `getProvider()` — routes to local or cloud provider |
| `src/providers/types.ts`                           | `SessionProvider` interface — `startTunnel()`, `onSessionClose()` lifecycle hooks |
| `src/providers/cloud/browserstack.provider.ts`     | BrowserStack provider — tunnel lifecycle + session result marking via `onSessionClose()` |
| `src/providers/cloud/testingbot.provider.ts`       | TestingBot provider — `tb:options` caps, single hub, form-encoded `test[success]` result marking, JAR tunnel via `testingbot-tunnel-launcher` |
| `src/providers/cloud/digitalai.provider.ts`        | Digital.ai provider — `digitalai:accessKey` (web) / `digitalai:options.accessKey` (mobile) caps, `<DIGITALAI_CLOUD_URL>/wd/hub`, mobile `deviceQuery`, `cloud:<id>` app refs; REST API via Bearer accessKey |
| `src/tools/session.tool.ts`                        | `start_session` (browser + mobile), `close_session` |
| `src/tools/get-elements.tool.ts`                   | `get_elements` — all elements with filtering + pagination |
| `src/tools/cloud-provider.tool.ts`                 | `list_apps`, `upload_app` — generalized across BrowserStack / Sauce Labs / TestMu / TestingBot and Digital.ai (Digital.ai uses Bearer auth; registered in `server.ts`) |
| `src/tools/query-docs.tool.ts`                     | `query_docs` — BM25 search over the WebdriverIO docs corpus; session-independent, so not wrapped in `withRecording` |
| `src/utils/docs-index.ts`                          | Docs corpus fetch/cache, fence-aware chunking, path alignment, 3-field BM25 index + search |
| `src/utils/docs-client.ts`                         | Boundary layer for the docs corpus — resolves the cache dir and loads the index |
| `src/resources/docs.resource.ts`                   | `wdio://docs/index` + `wdio://docs/page/{slug}` |
| `src/resources/`                                   | All MCP resource definitions (one per URI)    |
| `src/scripts/get-interactable-browser-elements.ts` | Browser-context element detection             |
| `src/locators/`                                    | Mobile element detection + locator generation |
| `src/recording/step-recorder.ts`                   | `withRecording(toolName, cb)` HOF — wraps tools for step logging |
| `src/recording/code-generator.ts`                  | Generates runnable WebdriverIO JS from `SessionHistory` |
| `src/utils/zod-helpers.ts`                         | `coerceBoolean` for client interop            |
| `tsup.config.ts`                                   | Build configuration                           |

## Gotchas

### Dev Reload vs Reconnect

`npm run dev` runs `tsx --watch` — code changes reload in-process, including ranking and search logic. Only tool/resource **schema changes** (Zod definitions, new tools, parameter additions) require an MCP client reconnect to re-advertise capabilities. Adding a resource counts even with no schema edit: the client caches the resource list at handshake, so new URIs stay invisible until reconnect. No need to rebundle or restart the dev server for implementation-only changes.

### Console Output

All console methods redirect to stderr via `console.error`. Chrome writes to stdout which corrupts MCP stdio protocol.

```typescript
// In server.ts - do not remove
console.log = (...args) => console.error('[LOG]', ...args);
console.info = (...args) => console.error('[INFO]', ...args);
console.warn = (...args) => console.error('[WARN]', ...args);
console.debug = (...args) => console.error('[DEBUG]', ...args);
```

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