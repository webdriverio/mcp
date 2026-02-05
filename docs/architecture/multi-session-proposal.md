# Multi-Session Architecture Proposal

> **Status**: Draft
> **Date**: 2026-02-05
> **Goal**: Enable parallel automation sessions for sub-agent coordination and cross-platform testing

---

## Problem Statement

### Current Limitation

The server maintains a single active session:

```typescript
// Current state in browser.tool.ts
const browsers: Map<string, WebdriverIO.Browser> = new Map();
let currentSession: string | null = null;  // ← Only one active
```

All tools operate on `currentSession`. No way to target a specific session.

### Use Cases Blocked

**1. Cross-Platform Validation**
> "Test that the checkout flow works on iOS, Android, and web"

Today: Run sequentially, switch sessions manually
Desired: Run in parallel, compare results

**2. Multi-User Interaction**
> "User A sends a message, verify User B receives it"

Today: Impossible — can't control two browsers simultaneously
Desired: Orchestrate two sessions, coordinate actions

**3. Sub-Agent Parallelism**
> Claude spawns sub-agents to test different scenarios

Today: Sub-agents share `currentSession`, causing conflicts
Desired: Each sub-agent targets its own session

**4. A/B Comparison**
> "Compare the logged-in vs logged-out experience"

Today: Sequential testing, lose context between switches
Desired: Side-by-side sessions

---

## Proposed Design

### Core Change: Session Targeting

Every tool gains an optional `sessionId` parameter:

```typescript
// Before (implicit session)
click_element({ selector: '#submit' })

// After (explicit session targeting)
click_element({ selector: '#submit', sessionId: 'user-a' })

// Default behavior preserved (uses current session if omitted)
click_element({ selector: '#submit' })
```

### Session Lifecycle

```typescript
// Create named sessions
start_browser({ sessionId: 'web-chrome', headless: true })
start_app_session({ sessionId: 'ios-app', platform: 'iOS', ... })
start_app_session({ sessionId: 'android-app', platform: 'Android', ... })

// Target specific sessions
navigate({ sessionId: 'web-chrome', url: 'https://example.com' })
tap_element({ sessionId: 'ios-app', selector: '~loginButton' })
tap_element({ sessionId: 'android-app', selector: '~loginButton' })

// Close specific session
close_session({ sessionId: 'ios-app' })

// Close all sessions
close_all_sessions()
```

### State Management

```typescript
interface SessionState {
  browsers: Map<string, WebdriverIO.Browser>;
  metadata: Map<string, SessionMetadata>;
  currentSession: string | null;  // Default target when sessionId omitted
}

interface SessionMetadata {
  type: 'browser' | 'ios' | 'android';
  name: string;                    // User-provided sessionId
  capabilities: Record<string, unknown>;
  createdAt: Date;
}
```

### Auto-Generated Session IDs

If `sessionId` not provided, generate one:

```typescript
start_browser({ headless: true })
// → Creates session with auto-id: "browser-1"

start_app_session({ platform: 'iOS', ... })
// → Creates session with auto-id: "ios-1"
```

Pattern: `{type}-{incrementing-number}`

### Session Listing

New tool to inspect active sessions:

```typescript
list_sessions()
// →
{
  sessions: [
    { sessionId: 'user-a', type: 'browser', capabilities: { browserName: 'chrome' } },
    { sessionId: 'user-b', type: 'browser', capabilities: { browserName: 'chrome' } },
    { sessionId: 'ios-app', type: 'ios', capabilities: { deviceName: 'iPhone 15' } }
  ],
  currentSession: 'user-a'
}
```

### Switching Default Session

```typescript
// Set default session for tools that omit sessionId
set_current_session({ sessionId: 'user-b' })

// Now these target user-b
click_element({ selector: '#submit' })  // → targets user-b
```

---

## Sub-Agent Coordination Patterns

### Pattern 1: Parent Orchestrates, Sub-Agents Execute

```
Parent Agent:
  1. start_browser({ sessionId: 'user-a' })
  2. start_browser({ sessionId: 'user-b' })
  3. Spawn sub-agent A: "Login as alice on session user-a"
  4. Spawn sub-agent B: "Login as bob on session user-b"
  5. Wait for both
  6. Spawn sub-agent A: "Send message 'hello' on session user-a"
  7. Wait
  8. Spawn sub-agent B: "Verify message 'hello' received on session user-b"
```

Sub-agents receive explicit session context, no conflicts.

### Pattern 2: Sub-Agent Owns Session Lifecycle

```
Parent Agent:
  1. Spawn sub-agent: "Test checkout on iOS"
     → Sub-agent creates its own session (auto-id: ios-1)
     → Sub-agent runs test
     → Sub-agent closes session
  2. Spawn sub-agent: "Test checkout on Android"
     → Sub-agent creates its own session (auto-id: android-1)
     → ...
```

Sessions are isolated by sub-agent.

### Pattern 3: Parallel Cross-Platform Testing

```
Parent Agent:
  1. Create sessions in parallel:
     - start_browser({ sessionId: 'web' })
     - start_app_session({ sessionId: 'ios', platform: 'iOS', ... })
     - start_app_session({ sessionId: 'android', platform: 'Android', ... })
  2. Spawn 3 sub-agents in parallel, each targeting one session
  3. Collect results, compare behavior
```

---

## MCP Server Architecture Implications

### Question: Can Sub-Agents Share an MCP Connection?

**Current behavior:**
- MCP server runs as single process
- Claude Code spawns sub-agents as separate processes
- Sub-agents inherit MCP server connections from parent
- But sub-agents share the same server state

**Implication:**
Without multi-session, two sub-agents calling `click_element` would both target `currentSession`, causing race conditions.

**With multi-session:**
Each sub-agent explicitly targets its session. No conflicts.

```typescript
// Sub-agent A
click_element({ sessionId: 'user-a', selector: '#send' })

// Sub-agent B (parallel)
get_visible_elements({ sessionId: 'user-b' })
```

Server handles both requests, routing to correct browser instance.

### Thread Safety

WebDriverIO browser instances are independent. Parallel operations on different sessions are safe.

Parallel operations on the *same* session are unsafe (WebDriver protocol is sequential). The server could:
1. **Ignore** — let WebDriver handle queueing (simplest)
2. **Warn** — log when concurrent calls target same session
3. **Queue** — serialize calls per session (complex)

**Recommendation**: Option 1 (ignore). WebDriver already handles this. Document the behavior.

---

## Implementation Plan

### Phase 1: Session Targeting (Minimal Change)

1. Add `sessionId` to all tool schemas (optional parameter)
2. Modify `getBrowser()` to accept optional sessionId:
   ```typescript
   export function getBrowser(sessionId?: string): WebdriverIO.Browser {
     const targetId = sessionId ?? currentSession;
     if (!targetId || !browsers.has(targetId)) {
       throw new Error(`No session: ${targetId || 'none active'}`);
     }
     return browsers.get(targetId)!;
   }
   ```
3. Pass sessionId through all tool implementations
4. Update session creation to accept custom sessionId

### Phase 2: Session Management Tools

1. Add `list_sessions` tool
2. Add `set_current_session` tool
3. Add `close_all_sessions` tool
4. Auto-generate sessionId when not provided

### Phase 3: Documentation & Patterns

1. Document sub-agent coordination patterns
2. Add examples to CLAUDE.md
3. Test with actual sub-agent workflows

### Phase 4: Observability

1. Add session info to all tool responses:
   ```typescript
   {
     content: [{ type: 'text', text: 'Clicked element' }],
     metadata: { sessionId: 'user-a', sessionType: 'browser' }
   }
   ```
2. Session activity logging
3. Stale session detection/cleanup

---

## Schema Changes

### Tool Parameter Addition

All existing tools gain optional `sessionId`:

```typescript
// Example: click_element
export const clickElementToolDefinition: ToolDefinition = {
  name: 'click_element',
  description: 'clicks an element',
  inputSchema: {
    selector: z.string().describe('CSS selector or XPath'),
    sessionId: z.string().optional().describe(
      'Target session ID. If omitted, uses current session.'
    ),
    scrollToView: z.boolean().optional().default(true),
    timeout: z.number().optional(),
  },
};
```

### New Tools

```typescript
// list_sessions
export const listSessionsToolDefinition: ToolDefinition = {
  name: 'list_sessions',
  description: 'List all active browser and app sessions',
  inputSchema: {},
};

// set_current_session
export const setCurrentSessionToolDefinition: ToolDefinition = {
  name: 'set_current_session',
  description: 'Set the default session for tools that omit sessionId',
  inputSchema: {
    sessionId: z.string().describe('Session ID to set as current'),
  },
};

// close_all_sessions
export const closeAllSessionsToolDefinition: ToolDefinition = {
  name: 'close_all_sessions',
  description: 'Close all active sessions',
  inputSchema: {
    detach: z.boolean().optional().describe('Detach instead of terminate'),
  },
};
```

---

## Usage Examples

### Cross-Platform Test

```typescript
// Setup
start_browser({ sessionId: 'web', headless: true, navigationUrl: 'https://app.example.com' })
start_app_session({ sessionId: 'ios', platform: 'iOS', appPath: '/path/to/app.ipa', deviceName: 'iPhone 15' })
start_app_session({ sessionId: 'android', platform: 'Android', appPath: '/path/to/app.apk', deviceName: 'Pixel 8' })

// Parallel login (via sub-agents or sequential)
execute_sequence({
  sessionId: 'web',
  actions: [
    { action: 'set_value', selector: '#email', value: 'test@example.com' },
    { action: 'set_value', selector: '#password', value: 'password123' },
    { action: 'click_element', selector: '#login' }
  ]
})

execute_sequence({
  sessionId: 'ios',
  actions: [
    { action: 'set_value', selector: '~emailField', value: 'test@example.com' },
    { action: 'set_value', selector: '~passwordField', value: 'password123' },
    { action: 'tap_element', selector: '~loginButton' }
  ]
})

execute_sequence({
  sessionId: 'android',
  actions: [
    { action: 'set_value', selector: '~emailField', value: 'test@example.com' },
    { action: 'set_value', selector: '~passwordField', value: 'password123' },
    { action: 'tap_element', selector: '~loginButton' }
  ]
})

// Verify all reached dashboard
get_visible_elements({ sessionId: 'web' })
get_visible_elements({ sessionId: 'ios' })
get_visible_elements({ sessionId: 'android' })
```

### Multi-User Chat Test

```typescript
// Setup two browsers
start_browser({ sessionId: 'alice', navigationUrl: 'https://chat.example.com' })
start_browser({ sessionId: 'bob', navigationUrl: 'https://chat.example.com' })

// Login both users
execute_sequence({ sessionId: 'alice', actions: [/* login as alice */] })
execute_sequence({ sessionId: 'bob', actions: [/* login as bob */] })

// Alice sends message
execute_sequence({
  sessionId: 'alice',
  actions: [
    { action: 'set_value', selector: '#message-input', value: 'Hello Bob!' },
    { action: 'click_element', selector: '#send-button' }
  ]
})

// Verify Bob receives it
get_visible_elements({ sessionId: 'bob' })
// → Should include element with text "Hello Bob!"
```

### Session Cleanup

```typescript
// List what's running
list_sessions()
// → { sessions: [...], currentSession: 'alice' }

// Clean up everything
close_all_sessions()
```

---

## Open Questions

### 1. Session Limits?

Should we cap the number of concurrent sessions?
- Browser instances consume memory (~200-500MB each)
- Appium sessions consume device/emulator resources

**Options:**
- No limit (user's responsibility)
- Soft warning at N sessions
- Hard limit with error

**Recommendation**: Soft warning at 5 sessions, no hard limit.

### 2. Session Timeout/Cleanup?

What happens to abandoned sessions?
- User creates session, forgets to close
- Sub-agent crashes without cleanup

**Options:**
- Manual cleanup only (current behavior)
- Idle timeout (close after N minutes of inactivity)
- Session lease (must heartbeat to keep alive)

**Recommendation**: Idle timeout of 30 minutes, configurable via env var.

### 3. Session Naming Conflicts?

What if user creates two sessions with same ID?

```typescript
start_browser({ sessionId: 'test' })
start_browser({ sessionId: 'test' })  // Error or replace?
```

**Options:**
- Error: "Session 'test' already exists"
- Replace: Close old session, create new
- Suffix: Create as 'test-2'

**Recommendation**: Error. Explicit is better than implicit.

### 4. Cross-Session Element References?

Can you reference an element from one session in another?

```typescript
// Get element in session A
const el = get_visible_elements({ sessionId: 'a' })

// Use that selector in session B?
click_element({ sessionId: 'b', selector: el[0].cssSelector })
```

This already works if selectors match. No special handling needed.

### 5. Session Metadata in Responses?

Should every tool response include session context?

```json
{
  "content": [{ "type": "text", "text": "Clicked element" }],
  "sessionId": "user-a",
  "sessionType": "browser"
}
```

**Pro**: Always clear which session was affected
**Con**: Verbose, redundant when sessionId was explicit

**Recommendation**: Include only when sessionId was auto-selected (omitted from request).

---

## Compatibility

### Backward Compatibility

- All existing tool calls continue to work (sessionId optional)
- Default behavior unchanged (single session, implicit targeting)
- Migration path: gradually add sessionId where needed

### Integration with Other Proposals

**Session Configuration (Provider Pattern):**
```typescript
start_session({
  sessionId: 'browserstack-ios',
  provider: 'browserstack',
  platform: 'ios',
  ...
})
```

**Interaction Sequencing:**
```typescript
execute_sequence({
  sessionId: 'user-a',
  actions: [...]
})
```

All three proposals compose cleanly.

---

## References

- [Playwright Browser Contexts](https://playwright.dev/docs/browser-contexts) — Similar isolation model
- [Selenium Grid](https://www.selenium.dev/documentation/grid/) — Multi-session at infrastructure level
- [WebDriverIO Multiremote](https://webdriver.io/docs/multiremote/) — Native multi-browser support
