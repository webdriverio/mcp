# Roadmap

> This roadmap reflects current thinking and priorities. It is not a commitment to deliver specific features by specific
> dates. Priorities may shift based on community feedback, contributor interest, and real-world usage patterns.

## Current

What's shipped and stable today.

| Area                  | Capabilities                                                                                  |
|-----------------------|-----------------------------------------------------------------------------------------------|
| Browser automation    | Chrome, Firefox, Edge, Safari; headed/headless; navigation, clicks, form filling, screenshots |
| Mobile automation     | iOS (XCUITest) and Android (UiAutomator2) via Appium; native + hybrid app support             |
| Element detection     | Platform-aware classification, multi-strategy locator generation, viewport filtering          |
| Session model         | Single active session (browser or mobile), state preservation, detach mode                    |
| Cloud providers       | BrowserStack browser + App Automate; provider abstraction ready for SauceLabs / LambdaTest    |
| Test infrastructure   | Vitest unit tests, ESLint + TypeScript checks, CI pipeline on every PR                        |
| Trace recording (v1)  | Synchronous Playwright-compatible trace zip; screenshot per action; auto-saved on session close; playable at player.vibium.dev |

---

## Next

High-value features actively being designed or in early implementation.

### Trace: Mobile / Appium Support

**Goal:** Extend trace recording to iOS and Android sessions.

The current synchronous model (capture screenshot after each traced tool call) maps cleanly to Appium — no architectural change needed. Mobile sessions just need to opt in via `trace: true` in `start_session` and have their tools wrapped with `withTrace`.

| What                           | Why it matters                                                    |
|--------------------------------|-------------------------------------------------------------------|
| `trace: true` for ios/android  | Same flag, same zip output, same player — no new concepts         |
| Screenshot capture via Appium  | `browser.takeScreenshot()` works identically on mobile            |
| Mobile-aware tool mapping      | `tap_element`, `swipe`, `scroll` already in `TOOL_MAP`; just enable the guard |

**Dependency:** None — the synchronous model works without BiDi.

### Interaction Sequencing

**Goal:** Reduce round-trips for multi-action workflows with automatic state change detection.

Today, a simple login flow requires 4+ tool calls. With `execute_sequence`, the AI sends all actions in one call and
gets back a state delta showing what changed.

| What                    | Why it matters                                                                   |
|-------------------------|----------------------------------------------------------------------------------|
| `execute_sequence` tool | Batch multiple actions (click, type, navigate) in a single round-trip            |
| State delta detection   | Automatically report what appeared, disappeared, or changed after actions        |
| Stability detection     | Wait for page to settle (loading spinners, async renders) before capturing state |
| Fail-fast with context  | Stop on first error, report partial progress and what changed up to that point   |

See: [`docs/architecture/interaction-sequencing-proposal.md`](docs/architecture/interaction-sequencing-proposal.md)

---

## Later

Features with clear use cases and initial designs, but dependent on foundational work landing first.

### Trace: WebDriver BiDi Mode

**Goal:** Opt-in async trace recording driven by WebDriver BiDi events instead of synchronous post-action capture.

The v1 trace records a screenshot after each tool call completes. This is simple and works, but it misses events that happen between tool calls (network requests, console errors, intermediate renders) and adds latency on every action.

BiDi mode subscribes to browser events asynchronously — screenshots, network activity, and console output arrive as they happen, decoupled from the tool call cycle.

| What                          | Why it matters                                                          |
|-------------------------------|-------------------------------------------------------------------------|
| Async screenshot capture      | Screenshots taken on page state changes, not on tool boundaries — more accurate filmstrip |
| `trace.network` population    | Real HAR-format network log from BiDi `network.*` events                |
| Console event recording       | Browser console errors/warnings captured as trace events               |
| Lower per-action latency      | No synchronous `takeScreenshot()` blocking each tool call               |
| Graceful fallback             | Sessions on browsers without BiDi support fall back to v1 synchronous mode |

**Dependency:** Requires Chrome/Edge with BiDi enabled (WebdriverIO `webSocketUrl: true`). Safari and Firefox BiDi support is partial — fallback needed. Not applicable to mobile/Appium sessions (which keep the synchronous model).

### Multi-Session Support

**Goal:** Enable parallel automation sessions for sub-agent coordination and cross-platform testing.

The server currently enforces a single active session. Multi-session adds an optional `sessionId` parameter to all
tools, allowing named sessions to run in parallel.

| What                                                              | Why it matters                                                       |
|-------------------------------------------------------------------|----------------------------------------------------------------------|
| Session targeting (`sessionId` on all tools)                      | Sub-agents can each control their own session without conflicts      |
| Session management tools (`list_sessions`, `set_current_session`) | Visibility and control over multiple concurrent sessions             |
| Cross-platform testing                                            | Run web + iOS + Android sessions simultaneously, compare behavior    |
| Multi-user scenarios                                              | "User A sends message, verify User B receives it" — impossible today |

**Dependency:** Benefits from Interaction Sequencing (`execute_sequence` + `sessionId` compose naturally).

See: [`docs/architecture/multi-session-proposal.md`](docs/architecture/multi-session-proposal.md)

---

## Ideas

Not committed. Exploring feasibility and demand.

| Idea                 | Description                                                       |
|----------------------|-------------------------------------------------------------------|
| Visual regression    | Screenshot comparison with diff highlighting                      |
| Record and replay    | Capture interaction sequences for deterministic re-execution      |
| File upload/download | Handle file dialogs and download verification                     |
| iframe support       | Navigate and interact within nested frames                        |
| Assertion helpers    | Built-in verification tools (element visible, text matches, etc.) |

---

## How to Influence This Roadmap

- **Open an issue** to request a feature or describe a use case
- **Comment on architecture proposals** in `docs/architecture/` — the open questions sections are specifically looking
  for input
- **Contribute** — PRs welcome, especially for items in the "Next" tier

---

## Dependency Map

```
┌─────────────────────────────────────────────────┐
│             Trace Recording (v1) ✓               │
│   synchronous, screenshot-per-action, browser    │
└──────────┬──────────────────────┬───────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐   ┌─────────────────────────┐
│  Mobile Tracing  │   │   Trace: BiDi Mode       │
│  (Appium, easy)  │   │   (async, browser only)  │
└──────────────────┘   └─────────────────────────┘

┌─────────────────────────┐
│  Interaction Sequencing  │
│   (execute_sequence)     │
└────────────┬────────────┘
             │ enhances
             ▼
┌──────────────────────┐
│  Multi-Session       │
│  (sessionId)         │
└──────────────────────┘
```
