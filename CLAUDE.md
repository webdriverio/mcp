# CLAUDE.md

Context for Claude Code when working with this repository.

## Commands

```bash
npm run bundle    # Build: clean + tsup + make executable + create .tgz
npm test          # Run unit tests (vitest + happy-dom)
npm run dev       # Development server (tsx, no build)
npm start         # Run built server from lib/server.js
```

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
│       └── browserstack.provider.ts  # BrowserStack (browser + App Automate)
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
  provider?: 'local' | 'browserstack';   // set at session start; used by lifecycle to call provider hooks
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
- `wdio://browserstack/local-binary` — platform-specific download URL and daemon start command for BrowserStack Local binary

### Build

- **tsup** bundles `src/server.ts` → `lib/server.js` (ESM)
- Shebang preserved for CLI execution
- `zod` externalized

## Key Files

| File                                               | Purpose                                       |
|----------------------------------------------------|-----------------------------------------------|
| `src/server.ts`                                    | MCP server init, tool + resource registration |
| `src/session/state.ts`                             | Session state maps, `getBrowser()`, `getState()` |
| `src/session/lifecycle.ts`                         | `registerSession()`, `closeSession()`, session transitions |
| `src/providers/registry.ts`                        | `getProvider()` — routes to local or cloud provider |
| `src/providers/types.ts`                           | `SessionProvider` interface — `startTunnel()`, `onSessionClose()` lifecycle hooks |
| `src/providers/cloud/browserstack.provider.ts`     | BrowserStack provider — tunnel lifecycle + session result marking via `onSessionClose()` |
| `src/tools/session.tool.ts`                        | `start_session` (browser + mobile), `close_session` |
| `src/tools/get-elements.tool.ts`                   | `get_elements` — all elements with filtering + pagination |
| `src/tools/browserstack.tool.ts`                   | `list_apps`, `upload_app` — BrowserStack App Automate |
| `src/resources/`                                   | All MCP resource definitions (12 files)       |
| `src/scripts/get-interactable-browser-elements.ts` | Browser-context element detection             |
| `src/locators/`                                    | Mobile element detection + locator generation |
| `src/recording/step-recorder.ts`                   | `withRecording(toolName, cb)` HOF — wraps tools for step logging |
| `src/recording/code-generator.ts`                  | Generates runnable WebdriverIO JS from `SessionHistory` |
| `src/utils/zod-helpers.ts`                         | `coerceBoolean` for client interop            |
| `tsup.config.ts`                                   | Build configuration                           |

## Gotchas

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

## Planned Improvements

See `docs/architecture/` for proposals:

- `session-configuration-proposal.md` — Cloud provider pattern (SauceLabs etc.) — BrowserStack already implemented; `providers/registry.ts` + `providers/cloud/` is the extension point
- `multi-session-proposal.md` — Parallel sessions for sub-agent coordination
- `interaction-sequencing-proposal.md` — Sequencing model for tool interactions