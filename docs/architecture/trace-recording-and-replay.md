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

## Two Recovery Tiers

Failure recovery is not a single workflow. Two distinct tiers exist with different cost, speed, and model requirements:

### Tier 1 — Offline trace analysis (cheap)

The CI loop: trace runs continuously, outputs are compared against the `.vibium` spec without a live browser session. No MCP. No human in the loop.

- **Input:** failing trace + `.vibium` spec
- **What the agent does:** reads `transcript.md` (zero parsing), checks assertions, identifies the divergence step, reads the viewport snapshot at that step
- **Output:** pass / corrected trace patch / unrecoverable failure report
- **Model:** a small/cheap model is likely sufficient — the context is structured text, not open-ended reasoning
- **When to use:** selector went stale, timing changed, minor assertion drift — mechanical failures where the spec intent is clear

The agent patches the trace in place. It does not re-run from scratch.

### Tier 2 — Live MCP reproduction (expensive)

When Tier 1 can't resolve the failure — because it's ambiguous whether the test or the app is wrong, or the failure mode requires seeing the live application. An agent drives a real browser session via MCP, reproduces the flow, produces a second trace, then compares the two traces at the divergence point.

- **Input:** failing trace + live browser session via MCP
- **What the agent does:** reads `transcript.md` to know the steps, navigates live using viewport snapshots to pick selectors, produces trace-B, diffs trace-A vs trace-B at the divergence point
- **Output:** root cause analysis + updated spec or trace
- **Model:** enterprise-level — live navigation + multi-trace reasoning requires strong inference
- **When to use:** ambiguous failures, suspected app regression, new feature broke the flow

The two traces are compared **only at the divergence point** — not as full sequential diffs. The agent identifies where transcript-A and transcript-B first differ (by step index and page state), then compares the viewport snapshots at that step.

---

## Snapshot format — viewport-only

Snapshots (`snapshot-*.txt`) contain only elements **visible in the current viewport** at the time of capture. Test frameworks scroll automatically — what matters at any step is what's on screen, not the full DOM.

This bounds snapshot size naturally (target: ~50 interactive elements vs. ~450 full-tree lines on a real page) and makes two-trace comparison meaningful: both snapshots represent the same visible surface, so structural diffs are genuine divergences, not DOM depth noise.

**Concrete implementation requirement:** `getBrowserAccessibilityTree` needs viewport bounds filtering (equivalent to the `inViewportOnly` flag already used in `getElements`). This is the next implementation step after the current snapshot infrastructure.

The `snapshot-*.txt` files in the trace zip are the concrete implementation of "original trace context" referenced elsewhere in this document. The agent receives both the *recorded* snapshot (what the page looked like at record time) and the *current* snapshot (what it looks like now) for each failed step.

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
