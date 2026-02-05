# CLAUDE.md

Context for Claude Code when working with this repository.

## Commands

```bash
npm run bundle    # Build: clean + tsup + make executable + create .tgz
npm run dev       # Development server (tsx, no build)
npm start         # Run built server from lib/server.js
```

No test or lint commands currently configured.

## Architecture

```
src/
├── server.ts                    # MCP server entry, registers all tools
├── tools/
│   ├── browser.tool.ts          # Session state + start_browser + getBrowser()
│   ├── app-session.tool.ts      # start_app_session (iOS/Android via Appium)
│   ├── navigate.tool.ts         # URL navigation
│   ├── get-visible-elements.tool.ts  # Element detection (web + mobile)
│   ├── click-element.tool.ts    # Click/tap actions
│   └── ...                      # Other tools follow same pattern
├── scripts/
│   └── get-interactable-browser-elements.ts  # Browser-context script
├── locators/
│   ├── element-filter.ts        # Platform-specific element classification
│   ├── generate-all-locators.ts # Multi-strategy selector generation
│   └── source-parsing.ts        # XML page source parsing for mobile
├── config/
│   └── appium.config.ts         # iOS/Android capability builders
└── types/
    └── tool.ts                  # ToolDefinition interface
```

### Session State

Single active session model in `browser.tool.ts`:

```typescript
const browsers: Map<string, WebdriverIO.Browser> = new Map();
let currentSession: string | null = null;
const sessionMetadata: Map<string, SessionMetadata> = new Map();

export function getBrowser(): WebdriverIO.Browser {
  // Returns current active session or throws
}
```

State shared with `app-session.tool.ts` via `(getBrowser as any).__state`.

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

### Build

- **tsup** bundles `src/server.ts` → `lib/server.js` (ESM)
- Shebang preserved for CLI execution
- `zod` externalized

## Key Files

| File                                               | Purpose                                       |
|----------------------------------------------------|-----------------------------------------------|
| `src/server.ts`                                    | MCP server init, tool registration            |
| `src/tools/browser.tool.ts`                        | Session state management, `getBrowser()`      |
| `src/tools/app-session.tool.ts`                    | Appium session creation                       |
| `src/scripts/get-interactable-browser-elements.ts` | Browser-context element detection             |
| `src/locators/`                                    | Mobile element detection + locator generation |
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

### Mobile State Sharing Hack

`app-session.tool.ts` accesses browser.tool.ts state via:

```typescript
const state = (getBrowser as any).__state;
```

This maintains single-session behavior across browser and mobile.

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

- `session-configuration-proposal.md` — Cloud provider pattern (BrowserStack, SauceLabs)
- `interaction-sequencing-proposal.md` — Batch actions with state delta detection
- `multi-session-proposal.md` — Parallel sessions for sub-agent coordination