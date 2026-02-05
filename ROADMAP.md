# Roadmap

> This roadmap reflects current thinking and priorities. It is not a commitment to deliver specific features by specific
> dates. Priorities may shift based on community feedback, contributor interest, and real-world usage patterns.

## Current (v2.x)

What's shipped and stable today.

| Area               | Capabilities                                                                                  |
|--------------------|-----------------------------------------------------------------------------------------------|
| Browser automation | Chrome, Firefox, Edge, Safari; headed/headless; navigation, clicks, form filling, screenshots |
| Mobile automation  | iOS (XCUITest) and Android (UiAutomator2) via Appium; native + hybrid app support             |
| Element detection  | Platform-aware classification, multi-strategy locator generation, viewport filtering          |
| Session model      | Single active session (browser or mobile), state preservation, detach mode                    |
| Data format        | TOON output for efficient LLM token usage                                                     |

---

## Next

High-value features actively being designed. Architecture proposals available in [
`docs/architecture/`](docs/architecture/).

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

### Testing and Quality

| What                     | Why it matters                                            |
|--------------------------|-----------------------------------------------------------|
| Unit test infrastructure | No tests exist today — foundation for confident iteration |
| CI pipeline              | Automated linting, type checking, and tests on every PR   |
| Tool contract tests      | Verify each tool's input validation and error handling    |

---

## Later

Features with clear use cases and initial designs, but dependent on foundational work landing first.

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

### Session Configuration / Provider Pattern

**Goal:** Make session creation extensible for cloud providers (BrowserStack, SauceLabs, custom Selenium Grids).

| What                         | Why it matters                                                     |
|------------------------------|--------------------------------------------------------------------|
| Provider abstraction         | Swap between local and cloud execution without changing tool calls |
| Unified `start_session` tool | Single entry point replaces `start_browser` + `start_app_session`  |
| Cloud provider integrations  | BrowserStack, SauceLabs, LambdaTest — run on real device farms     |
| Credential management        | Environment variables with parameter overrides for cloud auth      |

**Dependency:** Refactors session creation — should land before or alongside Multi-Session to avoid double-refactoring
`getBrowser()`.

See: [`docs/architecture/session-configuration-proposal.md`](docs/architecture/session-configuration-proposal.md)

---

## Ideas

Not committed. Exploring feasibility and demand.

| Idea                 | Description                                                       |
|----------------------|-------------------------------------------------------------------|
| Visual regression    | Screenshot comparison with diff highlighting                      |
| Record and replay    | Capture interaction sequences for deterministic re-execution      |
| Network interception | Monitor/mock API calls during automation                          |
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
                    ┌─────────────────────────┐
                    │  Interaction Sequencing  │
                    │   (execute_sequence)     │
                    └────────────┬────────────┘
                                 │ enhances
                                 ▼
┌───────────────────┐    ┌──────────────────┐
│ Session Config /  │───▶│  Multi-Session   │
│ Provider Pattern  │    │  (sessionId)     │
└───────────────────┘    └──────────────────┘
        │                        │
        ▼                        ▼
┌─────────────────────────────────────────┐
│         Cloud Provider Support          │
│   (BrowserStack, SauceLabs, Grids)      │
└─────────────────────────────────────────┘
```