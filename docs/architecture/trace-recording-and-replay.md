# Trace Recording and Replay

**Status:** In progress — recording (v1) shipped; replay and .vibium spec are future work.

---

## Vision

Turn the WebdriverIO MCP server into a test automation product, not just a browser control tool.

The goal is a two-file workflow that any tester can use:

1. Write a `.vibium` file describing what the test should do (natural language spec + assertions)
2. Run it once — an agent drives the browser, records every step, and produces a trace
3. Review and check in both files
4. On subsequent runs, replay the trace deterministically — no AI required
5. If replay breaks (selector changed, element missing), the agent uses the trace context to self-heal and update the
   trace

This is a "Claude Code for testing" — an agent that bootstraps a test from a spec and a deterministic runner that
executes it cheaply thereafter.

---

## The Two Files

### `.vibium` — the spec

A human-readable description of the test: what application, what flow, what to assert. Think of it as the test's source
of truth — the thing a tester writes and maintains.

```
# Search and add to basket

App: https://www.worldofbooks.com
Flow:
  - Search for "harry potter"
  - Add the first result to the basket
  - Navigate to checkout

Assert:
  - The checkout order summary contains "Harry Potter"
  - Total is non-zero
```

The exact format is TBD and should be aligned with what Jason (VibiumDev) has defined. Reference:
[vibium recording format](https://raw.githubusercontent.com/VibiumDev/vibium/refs/heads/main/docs/explanation/recording-format.md)

### `.trace` — the recorded execution

A zip (Playwright-compatible format) produced by running the `.vibium` spec through the MCP agent for the first time.
Contains:

- Every automation step (before/after events with params and timing)
- A screenshot per step (filmstrip)
- Enough application context to self-heal on replay failure

The trace is the "compiled" form of the spec. It is checked in alongside the `.vibium` file.

---

## Workflow

```
First run (agent-driven):

  .vibium spec
      │
      ▼
  MCP agent reads spec, drives browser via wdio-mcp tools
      │
      ▼
  Trace recorded (steps + screenshots + DOM context)
      │
      ▼
  Tester reviews, updates spec if needed, checks in both files

Subsequent runs (deterministic replay):

  .trace file
      │
      ▼
  Replay runner executes recorded steps directly — no AI
      │
      ├── All steps pass → test passes
      │
      └── Step fails (selector stale, element missing, assertion wrong)
              │
              ▼
          Agent invoked with:
            - failing step
            - trace context (screenshots, DOM snapshots at point of failure)
            - current page state
              │
              ▼
          Agent corrects the step, updates the trace, continues
```

---

## Two Separate Components

### 1. Automation Agent Harness

Reads a `.vibium` file, uses the WebdriverIO MCP server to drive the browser, and records the session as a trace.

- Input: `.vibium` spec
- Output: `.trace` zip
- AI/LLM: required (interprets spec, decides which tools to call, generates assertions)
- Model: likely an autonomous agent loop (LangChain DeepAgent or similar) wrapping the MCP server

This is where `wdio-mcp` lives. The trace recording infrastructure in `src/trace/` is the foundation.

### 2. Replay Runner

Reads a `.trace` zip and re-executes the recorded steps against the live application.

- Input: `.trace` zip
- Output: pass / fail with diff
- AI/LLM: not required for the happy path; invoked only on failure for self-healing
- Candidate home: `@wdio/trace` (extractable standalone package)

---

## Self-Healing on Failure

When replay fails, the agent gets:

- The recorded step that failed (selector, action, params)
- The screenshot and page state at the point of failure
- The original trace context (what the page looked like when the test was first recorded)

From this context the agent can:

- Try an alternative selector (text-based, aria label, structural)
- Update the trace with the corrected step
- Continue replay from that point
- Report an unrecoverable failure if the page structure has fundamentally changed (feature removed, flow redesigned)

The agent does not re-run from scratch. It patches the trace in place and continues.

---

## Non-Goals (for now)

- **AI is not required for deterministic replay.** The replay runner is a straightforward step executor.
- **The trace format is not MCP-specific.** `src/trace/` is intentionally extractable — it has no MCP dependencies. A
  standard WebdriverIO test run should be able to produce the same trace format.
- **Network interception (`trace.network`) and WebDriver BiDi** are on the roadmap alongside mobile tracing — not
  deferred indefinitely, just not part of the initial replay implementation.
- **Mobile/Appium** replay follows the same model but depends on trace recording being extended to Appium sessions
  first (see roadmap).

---

## Open Questions

1. **`.vibium` format** — what exactly does Jason's spec define? Should we adopt it directly or define a subset? The
   format needs to be expressive enough for assertions, not just navigation steps.

2. **Replay runner location** — standalone `@wdio/trace` package vs. built into `wdio-mcp` vs. a new `@wdio/replay`
   package?

3. **Trace versioning** — if the format evolves (e.g. BiDi adds network events), how do we keep old traces replayable?

4. **Selector strategy on self-heal** — when a selector fails, what order do we try alternatives? Should the trace
   record multiple fallback selectors at record time?

5. **Assertion format** — are assertions in the `.vibium` file? In the trace? Both?
