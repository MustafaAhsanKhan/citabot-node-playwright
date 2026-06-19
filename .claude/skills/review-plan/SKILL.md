---
name: review-plan
description: Use when about to accept, approve, or hand off an implementation plan, spec, or design for this Playwright cita-bot — reviewing either the plan currently in context or one passed as an argument (file path or inline text). Use before implementation begins, or when validating a plan that touches steps, selectors, waits, parsers, anti-detection, config/secrets, or tests.
---

# Plan Review Gate

Review an implementation plan/spec/design against the criteria that matter for
this repo — a Node.js + TypeScript Playwright (`patchright`) appointment-booking
bot built as a numbered step pipeline — before it is accepted.

Run the phases in order. Invoke each referenced skill with the Skill tool, then
evaluate the plan against its criteria. The **Bot-Specific Automation Review**
(Tier 3) is inline criteria — there is no skill for it; apply it directly.

## Section A: Resolve what to review

Do this first and state the result in your output.

- **Argument is an existing file path** → read it; review its contents.
- **Argument is provided but is not an existing file** → treat the literal
  argument text as the plan/spec to review.
- **No argument** → review the plan currently in context.

Begin the review by printing one line, e.g. `Reviewing: <path>`,
`Reviewing: inline argument text`, or `Reviewing: plan in context`.

## Phase 0: Code Graph Validation (GitNexus) — conditional

Validate the plan against the actual dependency graph before qualitative review.
This catches missed callers and untested flows that qualitative review cannot.

### Index check (do this first)

Call `mcp__gitnexus__list_repos`. If `citabot-node-playwright` is **not** in the
list, print `Graph Validation: SKIPPED — repo not indexed` and go to Phase 1.
(To enable it later: `npx gitnexus analyze`.)

If the repo is listed but a graph query (`list_repos`, `impact`, `context`)
errors at runtime — e.g. a stale index or DB version mismatch — print
`Graph Validation: SKIPPED — graph unavailable (<reason>)` and go to Phase 1. Do
not improvise an ad-hoc manual trace; the qualitative tiers cover correctness.

### Applicability gate

Skip Phase 0 (note it in output) when the plan only adds new files, is
config-only, or docs-only. Run it when the plan modifies, renames, deletes, or
changes the signature of existing symbols.

### Check 1: Blast radius

For each existing symbol the plan modifies (cap at the 5 highest by fan-in):

1. Run `mcp__gitnexus__impact({target: "symbolName", direction: "upstream"})`.
2. Collect d=1 (WILL BREAK) and d=2 (LIKELY AFFECTED) dependents.
3. Compare against the symbols the plan says it will update.
4. **Must Fix** — d=1 dependents the plan does not mention updating.
5. **Should Fix** — high-confidence d=2 dependents not mentioned.

### Check 2: Affected execution flow

For each modified symbol:

1. Run `mcp__gitnexus__context({name: "symbolName"})` for process participation.
2. Deduplicate processes across modified symbols.
3. Cross-reference against the plan's test strategy.
4. **Must Fix** — the core booking/cita flow is affected but not covered by the
   test plan.

### Short-circuit

Any Phase 0 Must Fix → present it immediately and request plan revision **before**
Phase 1. Do not run qualitative review on a structurally incomplete plan.

## Phase 1: Qualitative review

### Tier 1 — Plan Quality (always)

1. `concise-planning` — steps atomic, verb-first, concrete, with exact file paths.
2. `code-review-checklist` — baseline structural check.
3. `kaizen` — types over runtime checks, YAGNI, standardized work.

**Short-circuit:** any Tier 1 Must Fix (non-atomic steps, missing file paths,
symptom-fix without root cause) → present immediately and request revision before
Tier 2.

### Tier 2 — Core Technical (always)

1. `senior-architect` — architecture, maintainability, dependency analysis.
2. `architecture-patterns` — applied to the step-pipeline structure.
3. `typescript-expert` — type-level correctness, strict-mode patterns.
4. `nodejs-best-practices` — async patterns, Node security, architecture.
5. `test-driven-development` — TDD compliance, red-green-refactor coverage.
6. `lint-and-validate` — static analysis, project standards.

### Tier 3 — Bot-Specific Automation Review (always)

Inline criteria. There is no skill for this — apply each directly and categorize
findings like the rest. These are the concerns most likely to bite this repo and
the ones a generic review misses.

1. **Selector robustness** — does the plan prefer role/text/stable-attribute
   locators over brittle CSS/XPath and index-based selection (`nth-child`,
   `option:nth-child`) that breaks when the DOM shifts? New selectors should live
   with their step. Note: clicking an `<option>` does not select it in a native
   `<select>` — `selectOption` (the `select()` action helper) is required.
2. **Wait & timing strategy** — does it rely on Playwright auto-waiting /
   web-first assertions / the shared `src/steps/wait.ts`? Flag any bare
   `waitForTimeout`/sleep used as the primary synchronization mechanism, and
   missing navigation/network waits.
3. **Anti-detection / stealth** — does the change preserve stealth? It must keep
   `patchright` + `ghost-cursor` usage and human-like cursor/timing through the
   action helpers (`src/steps/actions.ts`), and a consistent proxy/profile
   fingerprint. Flag instant fills (`page.fill`/`page.type` straight to the
   element), missing mouse movement, or any new automation fingerprint.
4. **Step-pipeline conventions** — do new/changed steps follow the numbered
   convention (`NN-name.ts`), register in `src/steps/index.ts` / `walker.ts`, and
   reuse the shared `types.ts` / `actions.ts` / `wait.ts`? DOM extraction belongs
   in `src/lib/parsers.ts`, separate from navigation logic.
5. **Resilience & observability** — is transient-failure handling routed through
   `src/bot/errors.ts` / `runner.ts` / `pipeline.ts`, and is observability
   (`network-recorder`, `action-recorder`, `stats`) preserved?
6. **Automation testing** — do parser/pure-logic changes get unit tests against
   `tests/fixtures/*.html` (with fixtures added/updated when the DOM changes)? Do
   flow changes exercise the mock-server (`npm run mock:bot`)? Does the plan
   account for the `tsc` → `node --test "dist/tests/**/*.test.js"` build step
   (tests run on compiled output in `dist/`, not the `.ts` sources)?

### Tier 4 — Conditional

Invoke only when the trigger matches:

- **Bug fix / regression** — title/description contains `fix`, `bug`, `debug`,
  `regression`, `incident`, `error`, `broken` → `systematic-debugging`.
- **Secrets / credentials** — touches `config.json`, `profiles/`, proxy
  credentials, notification tokens, `.env`, or mentions `key`/`rotation` →
  `secrets-management` + `vulnerability-scanner`.
- **Mock-server / HTTP harness** — touches `src/mock-server/**` →
  `backend-dev-guidelines` (the only HTTP surface in the repo).

### Categorize all findings

- **Must Fix** — blocks approval; structural or correctness issue.
- **Should Fix** — recommended; misses a best practice.
- **Consider** — optional; minor enhancement or alternative.

If Must Fix or Should Fix items exist, revise the plan and re-review.

## Phase 2: Consolidated review summary

Present findings in three labelled sections:

1. **Code Graph Validation** — Phase 0 findings (or the SKIPPED note).
2. **Qualitative Review** — Tier 1, 2, and 4 findings.
3. **Bot-Specific Automation Review** — Tier 3 findings.

End with an explicit verdict. Any Must Fix in any section → the plan is **NOT
approved**; otherwise state it is approved (note any Should Fix / Consider items).
