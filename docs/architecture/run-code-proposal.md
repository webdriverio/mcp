# `run_code` — WebdriverIO code through the agent's `exec`

**Status:** `run_code` behind `--allow-code` / `WDIO_MCP_RUN_CODE` in review as #197 (targets feature/v5; supersedes the closed #199); client logging shipped in #198; tracking issue #223;
the engine gaps are filed as webdriverio/webdriverio#16493. Facts checked 2026-11-21 against `@wdio/mcp` `feature/v5` (`b2b1bf2`;
main has since gained #196, #198, #200 and #210, so `src/session/agent.ts` differs) and the `@wdio/session` source at tag `v10.2.0` (`5743972`). Session paths
are relative to `packages/wdio-session/`; MCP paths to this repo. The two never collide: `src/agent.ts`,
`src/session.ts`, `src/constants.ts` and anything under `src/actions/`, `src/exec/` or `src/cli/` is session's
(MCP has none of these); every other path is MCP's. The engine behaviour was run on 2026-11-21 against the real `@wdio/session` agent with a stub
browser; no real browser backs this document (see *Unverified*).

**Placement:** an adapter over an engine action, so it fits decision 1 (session is the engine, MCP the adapter). The v5
roadmap holds new tools until decision 4; this proposal is also the experiment that gives decision 4 its evidence (see
*Measurement*).

---

## Problem

MCP has no tool that runs WebdriverIO code in Node.

- `execute_script` runs JavaScript **in the page** (`browser.execute`, `src/tools/execute-script.tool.ts:61`).
- `perform_actions` runs a fixed list of steps: no loops, conditions, waits on a condition or assertions.
- So "filter 500 table rows", "retry until the toast appears" or "fill every slider" costs one model round trip per
  step, and every intermediate result passes through the model's context. This is the cost Anthropic's
  [code execution with MCP](https://www.anthropic.com/research/code-execution-with-mcp) article describes: let code
  process the data and return only what it prints.

The engine already has the capability. Session's `exec` runs code as an async function with `browser`, `$`, `$$`,
`expect` and `ref('e3')` in scope, and top-level variables persist between calls (`src/actions/specs.ts:182-187`;
one context per session, `src/exec/context.ts:83-90`). Shell agents reach it as `wdio session exec`. MCP clients
cannot reach it.

The article's other pattern — one generated TypeScript file per MCP tool under `./servers/` — is **not** proposed:
WebdriverIO already is a typed code API, so wrapping MCP tools as code would be a second, worse WebdriverIO.

---

## Proposal

One tool, `run_code`, routed (gets the `session` argument from `withSessionTarget`) and listed only by user opt-in (see
*Exposure*).

| Concern | Adapter behaviour | Evidence |
| --- | --- | --- |
| Call | `agent.runAction('exec', { code, $timeout: RUN_CODE_TIMEOUT_MS })` — **not** `agent.run('exec', …)` | `run` types its arguments from the CLI spec, which declares `e` and `file` (`src/actions/specs.ts:188-191`); `exec` reads `args.code` (`src/actions/exec.ts:97`). Only the CLI maps `-e`/file/stdin to `code` (`src/cli/command.ts:260-283`). `agent.run('exec', { e })` type-checks and runs empty code. |
| Timeout | The engine's `$timeout`, passed in the call; no MCP-side bound or `session.abandon()`: the engine calls `session.abandon()` itself when `$timeout` fires | The agent passes no timeout (`src/agent.ts:131-132`); `$timeout` is set only from `dispatch`'s `opts.timeout` (`src/session.ts:324`), and without it `exec` waits for ever (`src/actions/exec.ts:72-75`). |
| Bound | 60 s, the engine's `exec` default; below the 90 s queue guard | `DEFAULT_EXEC_TIMEOUT` (`src/constants.ts:8`); MCP's action bound is 30 s (`src/session/agent.ts:32`), the queued-call guard 90 s (`src/session/routing.ts:57`). |
| Output | Cap inline text at 12,000 characters (`SNAPSHOT_MAX_CHARS`, `src/utils/snapshot-text.ts:2`); past that, write the full text to a file and return its path with the head | `exec` inlines up to 256 KB (`src/constants.ts:16`, `src/actions/exec.ts:142-147`). Claude Code warns above 10,000 tokens, cuts at 25,000 by default and saves text results over 50,000 characters to a file ([docs](https://code.claude.com/docs/en/mcp)); other clients are unknown. |
| Page changes | v4: not reported. The call goes through `agent.runAction` and returns `exec`'s text only. Reusing `runActionWithChanges` is a follow-up | `exec` is an observed action (`src/actions/changes.ts:19-24`). |
| Recording | v4: `recordCode` takes the first `exec` history entry with `n` above the last entry's `n` from before the call; a read-only call appends none, so nothing is recorded. When S4 lands: `recordCode(result.code)` like every other action | `dispatch` appends the ref-rewritten, non-read-only code to the history and strips it from the result (`src/actions/exec.ts:149-154`, `src/session.ts:405-415`); the agent exposes the history (`src/agent.ts:228-229`). The code generator already emits a step's `code` lines as they are (`src/recording/code-generator.ts:145-149`). |
| Trace | v4: `instrument('run_code', …)` in `src/server.ts` plus a `TOOL_MAP` entry `run_code: { class: 'Browser', method: 'runCode' }` in `src/trace/tool-mapping.ts`; without the entry `withTrace` records nothing. One step per call. v5: one step per agent action through S2, so `run_code` does **not** join the direct-tool list that depends on D7 | `v5-proposal.md`, *Trace swap acceptance criteria*. |
| Description | States the boundary: Node with `browser`/`$`/refs vs `execute_script`'s in-page JavaScript; prefer single actions when one does the job | Same rule as the engine's own spec text (`src/actions/specs.ts:186`). |
| `args` | Not in the first version. Added when S4 gives `exec` an `args` input | `v5-upstream-issues-to-file.md`, S4. |

`execute_script` stays as it is: in-page JavaScript with element arguments is a different capability, not a duplicate.

---

## Exposure

`run_code` runs in the **MCP server process**. The context exposes `process`, `fetch`, timers and dynamic `import`
(`src/exec/context.ts:180-200`), and `node:vm` is not a security boundary. For the model it is a shell.

| Tool | Where the code runs |
| --- | --- |
| `execute_script` | The page |
| `execute_electron_script` | The Electron app's main process (`src/tools/electron-execute.tool.ts:11`, `:30-31`) |
| `run_code` | The MCP server's own process |

- **Shell clients** (Claude Code, Codex, opencode): no new capability; they already run commands.
- **Shell-less clients** (Claude Desktop and similar): `run_code` is a new capability, and these are the clients it is
  for. The value and the risk are the same property.
- Therefore listing must be the **user's** choice, made in configuration: not an `enable_tools` group, which the model
  can turn on itself (`src/tool-visibility.ts`). Decided: `--allow-code` and `WDIO_MCP_RUN_CODE=1`/`true`, either one.
- **HTTP.** The HTTP server listens on every interface (`.listen(args.port)` in `src/server.ts`), and the `Host`
  allowlist does not stop a client on the network that sends `Host: localhost`. With `--allow-code` that client can run
  code in the server process. Fixed by #200 (merged to main; loopback only unless `--host`); #197's warning fires whenever `--allow-code` is combined with `--http`.
- `console` inside `exec` goes to a sink (`capturedConsole`, `src/exec/context.ts:109`, `:180`), but `process.stdout.write` does not,
  and `src/server.ts` reassigns only `console`. Code that writes to `process.stdout` corrupts the stdio transport (#209).
  Filed upstream as an opt-in restricted `exec` context: webdriverio/webdriverio#16495.
- **Prompt injection.** This server reads untrusted page text into the model, so a page can steer the agent into writing
  code that `run_code` runs with the user's rights. Run on the real agent (stub browser, 2026-11-22), `exec` code sees
  `process`, `process.env`, `fetch` and `import("node:fs")`.
- **Leaving out globals is not a boundary.** `browser.constructor.constructor("return process")()` returns the host's
  `process` from any host object, including in a plain `node:vm` context without `process` (Node 22). The restricted
  context (#16495) prevents accidents; isolation is an engine feature of `@wdio/session`, which owns the code runner:
  webdriverio/webdriverio#16496 (code outside the host process, `browser` forwarded as messages). Until it ships,
  `run_code` stays opt-in. Cloudflare's [Code Mode](https://blog.cloudflare.com/code-mode-mcp/) runs model code
  server-side in a V8 isolate with no file system, no environment and outbound fetch off; that is the model for #16496.

---

## Concurrency and dependencies

- **Global `browser`.** `getExecContext` sets `globalThis.browser ??= session.browser` and `globalThis.driver` the same
  way (`src/exec/context.ts:93-98`; the comment there says some matchers read it), so the first session that runs `exec` owns the process-wide `browser`. MCP runs
  concurrent sessions in one process; a matcher that reads the global `browser` would act on the first session.
  Which matchers read it is unverified. Candidate upstream issue (S7 below).
- **Queue.** A `run_code` call holds its session's queue for its whole run (`src/session/routing.ts:38-46`). That is the
  intended serialisation; other sessions are unaffected.
- **`expect`.** `expect-webdriverio` is an optional peer, resolved from the session's `cwd` when `expect` is first used
  (`src/exec/context.ts:92`, `:208-224`). MCP creates the agent without a `cwd` (`src/session/agent.ts:25`), so it is
  `process.cwd()` (`src/agent.ts:253`) — whatever directory the client started the server in. `expect-webdriverio` is
  not in MCP's dependency tree today, so `expect` in `run_code` fails with `MISSING_DEPENDENCY`. Adding it as a
  dependency would work: with it added, pnpm links it next to `@wdio/session` (2026-11-21; +9.3 MB in the store). Decided
  for v4: not added. Loops, waits and checks need only `waitUntil`/`waitFor*` and `throw`, and the generated script
  imports only `remote`, so a recorded `expect` line would not run there. The tool description says `expect` is unavailable.
- **Artifacts.** With no `artifactsDir`, the agent writes to a fresh `wdio-agent-*` temp directory (`src/agent.ts:254`);
  `exec`'s spill file lands there.

---

## Measurement (evidence for decision 4)

### Does `run_code` pay off?

| Arm | Client | Tools |
| --- | --- | --- |
| A | Claude Desktop, Claude Code | `snapshot` / `perform_actions` / single actions (no `run_code`) |
| B | Claude Desktop, Claude Code | A plus `run_code` |
| C | Claude Code | `wdio session` CLI plus its skill (`npx wdio session skill --install .`), no MCP |
| D | Claude Desktop, Claude Code | `WDIO_MCP_TOOLS=code` (#212, open issue, not implemented: `src/toolsets.ts` only knows `WDIO_MCP_TOOLS=all`): `start_session`, `navigate`, `snapshot`, `query_docs`, `run_code`, `close_session` only |

Tasks, each on a fixed local page or app:

1. Filter a 500-row table and report the matching rows.
2. Click Save and wait for an asynchronous toast.
3. Complete a three-page form wizard.
4. Log in and assert the landing URL and a heading.
5. Scroll a native Android list until an item appears and tap it.

Measure per run: input and output tokens, model turns, wall-clock time, success (checked by a script after the
run, not by the model), and the **code error rate**: `run_code` calls that fail, and how many retries it takes to get
working code. WebdriverIO v10 differs from older training data (strict `$`, for one), and Code Mode's own write-up
gives token counts only, not error rates. Three runs per cell, same model in every arm. Gate: `run_code` is worth shipping if B beats A
on tasks 1, 2 and 5 by at least 30% in tokens with no loss of success; tune the threshold before running, not after.
B against C on Claude Code answers decision 4's "the session CLI plus a skill is often better" with a number. D against
B, and against every tool listed for tool search (#203, open; PR #229 against main), shows whether a fixed six-tool set (about 10,300 characters
of definitions, against 18,095 for the default list) costs success or turns.

**Skill as a second variable** (once open #219 moves the server to SDK v2 and open #220 serves a `wdio-mcp` skill over the MCP
Skills extension): run arms A, B and D with and without the skill. Its `references/run-code.md` covers v10's strict `$`,
`ref()` for recorded selectors and the missing `expect`, so B and D with the skill against B and D without it measure the
skill's effect on the code error rate. Skills over MCP is supported by Claude and Claude Code only (public beta, November
2026), so this part runs in those two clients; arm C keeps `@wdio/session`'s own shell skill.

### Which clients do MCP users run?

Evidence on 2026-11-21 (GitHub code search through the REST API, repositories outside `webdriverio` that name
`@wdio/mcp`). Configuration files committed:

| File | Client | Repos |
| --- | --- | --- |
| `.mcp.json` | Claude Code (project scope) | 7 |
| `.cursor/mcp.json` | Cursor | 2 |
| `opencode.json` / `opencode.jsonc` | opencode | 2 |
| `.codex/config.toml` | Codex | 1 |
| `.kiro/settings/mcp.json` | Kiro | 1 |
| `.copilot/mcp.json` | GitHub Copilot | 1 |

Plus one skill file that drives MCP (`.github/skills/…/SKILL.md`). Issues and PRs in this repository mention Claude
Code, Copilot and Codex once each; no other client by name.

This is **biased toward shell clients**: only project-scope configuration is committed. Claude Desktop's
`claude_desktop_config.json` and every user-scope configuration live outside repositories, so the table cannot see
shell-less users at all. It is also small (about 13 repositories). It is a floor, not a distribution.

The direct signal is `clientInfo.name` in the MCP `initialize` request. Cheapest first:

1. Log `clientInfo` (name and version) to stderr at the handshake, so it appears in every client log a user attaches
   (shipped in #198: `[INFO] MCP client: <name> <version>`).
2. Add a required "MCP client" dropdown to the bug and feature issue templates.
3. A pinned GitHub Discussion poll, linked from the README.
4. Re-run the code search each quarter with the queries below.

Not proposed: telemetry. If it is ever wanted, it is opt-in, announced, and an owner decision outside this document.

Code search queries (GitHub REST `search/code`, then drop `webdriverio/*`): `"@wdio/mcp" filename:.mcp.json`,
`"@wdio/mcp" filename:mcp.json`, `"@wdio/mcp" path:.cursor`, `"@wdio/mcp" path:.vscode`, `"@wdio/mcp" path:.kiro`,
`"@wdio/mcp" path:.codex`, `"@wdio/mcp" path:.gemini`, `"@wdio/mcp" filename:opencode.json`,
`"@wdio/mcp" filename:claude_desktop_config.json`, `"@wdio/mcp" path:.github`.

---

## Upstream

- **S4, extended — filed as webdriverio/webdriverio#16493.** Besides returning `code` and accepting `args`: make
  `agent.run('exec', …)` accept the argument the action reads (`code`, or map `e`), and let `run`/`runAction` take a
  timeout that reaches `$timeout`. Reproduced on the real agent: a typed `run('exec', { e })` returns `""`; a
  `$timeout: 3000` fails after 2,003 ms with the output so far. #197 works around both with `runAction('exec', { code, $timeout })`.
- **Restricted context and isolation — filed as webdriverio/webdriverio#16495 and #16496.** See *Exposure*.
- **S7 candidate, not drafted.** The process-wide `globalThis.browser` set by the first `exec` context. Drafted only
  once a matcher that reads it is identified. Listed under *Candidate, not drafted* in the drafts file.

---

## Open decisions

1. **Opt-in mechanism.** Decided: a CLI flag and an environment variable (#197).
2. **`expect-webdriverio`.** Decided for v4: not a dependency; `expect` is unavailable in `run_code` (see *Concurrency and
   dependencies*).
3. **`process.stdout`** inside `exec`: engine change, filed as webdriverio/webdriverio#16495 (open #209 tracks it here).
4. **Timing.** Decided: ships behind the opt-in on feature/v5 as the decision 4 experiment (#197); a v4.x backport is not decided.
5. **HTTP binding.** Decided: loopback only unless `--host` (#200).
6. **Isolation.** Decided: a `@wdio/session` feature, not MCP's (webdriverio/webdriverio#16496). MCP turns it on when
   it exists.

---

## Unverified

- **No real browser.** The environment had Chrome 153 and chromedriver 147 and could not download a matching driver.
  `exec` was run through the real `@wdio/session` agent with a stub browser (code that does not touch the page), which
  covers input, timeout, persistence, history and output; page actions and ref rewriting were not run.
- **Global `browser`:** which `expect-webdriverio` matchers read it.
- **Claude Desktop's working directory** for a stdio server, which decides where a relative `import` in `run_code` resolves.
- **Code search completeness:** the REST code search returns at most 100 results per query and indexes default
  branches only; forks and private repositories are not covered.
