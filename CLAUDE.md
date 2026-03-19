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
├── server.ts                    # MCP server entry, registers all tools + MCP resources
├── session/
│   ├── state.ts                 # Session state maps, getBrowser(), getState(), SessionMetadata
│   └── lifecycle.ts             # registerSession(), handleSessionTransition(), closeSession()
├── providers/
│   ├── types.ts                 # SessionProvider interface, ConnectionConfig
│   ├── local-browser.provider.ts  # Chrome/Firefox/Edge/Safari capability building
│   └── local-appium.provider.ts   # iOS/Android via appium.config.ts
├── tools/
│   ├── browser.tool.ts          # start_browser, close_session, readTabs(), switch_tab
│   ├── app-session.tool.ts      # start_app_session (iOS/Android via Appium)
│   ├── navigate.tool.ts         # navigateAction() + navigateTool
│   ├── click.tool.ts            # clickAction() + clickTool
│   ├── set-value.tool.ts        # setValueAction() + setValueTool
│   ├── scroll.tool.ts           # scrollAction() + scrollTool
│   ├── gestures.tool.ts         # tapAction(), swipeAction(), dragAndDropAction()
│   ├── execute-sequence.tool.ts # Batch action sequencing with stability + state delta
│   └── ...                      # Other tools follow same pattern
├── recording/
│   ├── step-recorder.ts         # withRecording HOF, appendStep, session history access
│   ├── code-generator.ts        # SessionHistory → WebdriverIO JS code
│   └── resources.ts             # MCP resource builders (sessions index, step log)
├── scripts/
│   └── get-interactable-browser-elements.ts  # Browser-context script
├── locators/
│   ├── element-filter.ts        # Platform-specific element classification
│   ├── generate-all-locators.ts # Multi-strategy selector generation
│   └── source-parsing.ts        # XML page source parsing for mobile
├── config/
│   └── appium.config.ts         # iOS/Android capability builders (used by local-appium.provider)
├── utils/
│   ├── parse-variables.ts       # URI template variable parsing (parseBool, parseNumber, etc.)
│   ├── stability-detector.ts    # Page stability polling (signature-based, 200ms/500ms/5s)
│   └── state-diff.ts            # Element before/after diff (appeared, disappeared, changed)
└── types/
    ├── tool.ts                  # ToolDefinition interface
    └── recording.ts             # RecordedStep, SessionHistory interfaces
```

### Session State

Single active session model in `src/session/state.ts`:

```typescript
// Private state — access via getState() or getBrowser()
export function getBrowser(): WebdriverIO.Browser { ... }
export function getState() { return state; }
export interface SessionMetadata { type: 'browser' | 'ios' | 'android'; capabilities: Record<string, unknown>; isAttached: boolean; }
```

Session lifecycle managed via `src/session/lifecycle.ts`:
- `registerSession()` — registers browser + metadata + history, handles transition sentinel
- `handleSessionTransition()` — appends `__session_transition__` step to outgoing session
- `closeSession()` — terminates or detaches, marks endedAt, cleans up maps

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

// 3. Register in server.ts
server.tool(myToolDefinition.name, myToolDefinition.description, myToolDefinition.inputSchema, myTool);
```

### Recording

All tools are wrapped with `withRecording()` in `server.ts`. Steps accumulate in `state.sessionHistory` (keyed by sessionId).
MCP resources expose history without tool calls:
- `wdio://sessions` — index of all sessions (fixed URI, discoverable via ListResources)
- `wdio://session/current/steps` — current session step log + generated JS (fixed URI)
- `wdio://session/{sessionId}/steps` — any session by ID (URI template, NOT listed by ListResources — see `docs/architecture/mcp-resources-notes.md`)

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
| `src/tools/browser.tool.ts`                        | `start_browser`, `close_session`, `switch_tab`, `readTabs()` |
| `src/tools/app-session.tool.ts`                    | Appium session creation                       |
| `src/tools/execute-sequence.tool.ts`               | Batch action sequencing with stability + delta |
| `src/providers/local-browser.provider.ts`          | Chrome/Firefox/Edge/Safari capability building |
| `src/providers/local-appium.provider.ts`           | iOS/Android capabilities via appium.config.ts |
| `src/scripts/get-interactable-browser-elements.ts` | Browser-context element detection             |
| `src/locators/`                                    | Mobile element detection + locator generation |
| `src/recording/step-recorder.ts`                   | `withRecording(toolName, cb)` HOF — wraps every tool for step logging |
| `src/recording/code-generator.ts`                  | Generates runnable WebdriverIO JS from `SessionHistory` |
| `src/recording/resources.ts`                       | Builds text for `wdio://sessions` and `wdio://session/*/steps` resources |
| `src/utils/stability-detector.ts`                  | Page stability detection (signature polling)  |
| `src/utils/state-diff.ts`                          | Element state diff (appeared/disappeared/changed) |
| `tsup.config.ts`                                   | Build configuration                           |

## Gotchas

### Console Output

All console methods redirect to stderr. Chrome writes to stdout which corrupts MCP stdio protocol.

```typescript
// In server.ts - do not remove
console.log = (...args) => process.stderr.write(util.format(...args) + '\n');
```

### Browser Scripts Must Be Self-Contained

`get-interactable-browser-elements.ts` executes in browser context via `browser.execute()`. Cannot use Node.js APIs or
external imports.

### Auto-Detach Behavior

Sessions created with `noReset: true` or without `appPath` automatically detach on close (don't terminate on Appium
server).

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
3. Import and register in `src/server.ts`:
   ```typescript
   import { myToolDefinition, myTool } from './tools/my-tool.tool';
   server.tool(myToolDefinition.name, myToolDefinition.description, myToolDefinition.inputSchema, myTool);
   ```

## Selector Syntax Reference

**Web:** CSS (`#id`, `.class`), XPath (`//button`), Text (`button=Exact`, `a*=Contains`)

**Mobile:**

- Accessibility ID: `~loginButton`
- Android UiAutomator: `android=new UiSelector().text("Login")`
- iOS Predicate: `-ios predicate string:label == "Login"`
- XPath: `//XCUIElementTypeButton[@label="Login"]`

## Planned Improvements

See `docs/architecture/` for proposals:

- `session-configuration-proposal.md` — Cloud provider pattern (BrowserStack, SauceLabs) — providers/types.ts is the extension point
- `multi-session-proposal.md` — Parallel sessions for sub-agent coordination