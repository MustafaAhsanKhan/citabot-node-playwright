# Design: `review-plan` skill for `citabot-node-playwright`

**Date:** 2026-06-19
**Status:** Approved (design)

## Purpose

A repo-local skill that reviews an implementation plan, spec, or design against
the criteria that matter for *this* codebase before the plan is accepted. It is
adapted from `timba-bot`'s `review-plan` skill, but retargeted from a full
web-app stack to this repo's actual stack: a Node.js + TypeScript Playwright
(`patchright`) appointment-booking bot built as a step pipeline.

It differs from the reference in three ways:

1. **Pruned lenses** — the reference's frontend, API, database, auth, and
   LLM/prompt skill categories do not apply here and are removed.
2. **Added bot-specific criteria** — the review concerns most likely to bite an
   automation bot (selector robustness, wait/timing strategy, anti-detection,
   step-pipeline conventions, automation testing) have no skill to invoke, so
   they are written into the skill as inline review criteria.
3. **Flexible input** — it reviews the plan currently in context *or* a
   plan/spec/design supplied as an argument (file path or inline text).

## Stack context (why the tailoring)

- Node.js + TypeScript, CommonJS, `target` ES2020, `strict` mode.
- Browser automation via `patchright` (patched Playwright) + `ghost-cursor-playwright`
  for human-like cursor movement; `https-proxy-agent` for proxying.
- Architecture: a numbered **step pipeline** (`src/steps/00-…` … `07-…`) driven
  by a `walker`/`runner`/`pipeline` (`src/bot/`), with DOM extraction isolated in
  `src/lib/parsers.ts`, and `notifications.ts`/`stats.ts` for side effects.
- Tests use Node's built-in runner against **compiled** output:
  `tsc` then `node --test "dist/tests/**/*.test.js"`. Unit tests run against HTML
  fixtures in `tests/fixtures/`; an integration `flow.test.ts` and a mock-server
  (`src/mock-server/`) exercise the flow.
- **Not present:** no frontend, no database/ORM, no auth subsystem, no LLM/AI, no
  product API (the mock-server is only a test harness).

## Skill identity & location

- **Path:** `.claude/skills/review-plan/SKILL.md` (the `.claude/` tree does not
  yet exist in this repo and will be created).
- **Name:** `review-plan`.
- **Description (frontmatter):** "Review an implementation plan/spec/design — the
  one in context or one passed as an argument — against plan-quality,
  Node/TypeScript, TDD, and Playwright-bot reliability criteria before
  acceptance."

## Section A — Resolving what to review (the requested modification)

Evaluated first, before any review work. Resolution order:

1. **Argument is an existing file path** → read it; review its contents.
2. **Argument provided but not an existing file** → treat the literal argument
   text as the plan/spec to review.
3. **No argument** → review the plan currently in context.

The skill must state the resolution explicitly in its output, e.g.
`Reviewing: docs/superpowers/specs/2026-06-19-…-design.md` or
`Reviewing: plan in context`, so it is unambiguous what was assessed.

## Section B — Phase 0: Code Graph Validation (conditional, graceful skip)

GitNexus graph validation, scaled down for a ~20-file repo.

- **Index check first:** call `mcp__gitnexus__list_repos`.
  - If `citabot-node-playwright` is **not indexed** → emit
    `Graph Validation: SKIPPED — repo not indexed` and continue to Phase 1.
  - If **indexed** → run the slimmed checks below.
- **Applicability gate** (same as reference): skip Phase 0 entirely when the plan
  only adds new files, is config-only, or docs-only. Note the skip in output.
- **Check 1 — Blast radius:** for each existing symbol the plan modifies
  (cap at the top symbols by fan-in), run
  `mcp__gitnexus__impact({target, direction: "upstream"})`, collect d=1 (WILL
  BREAK) and d=2 (LIKELY AFFECTED) dependents, compare against what the plan says
  it will update. Must Fix = unmentioned d=1 dependents.
- **Check 2 — Affected execution flow:** for each modified symbol, run
  `mcp__gitnexus__context({name})`, dedupe participating processes, cross-
  reference against the plan's test strategy. Must Fix = critical-path flow (e.g.
  the booking/cita flow) not covered by the test plan.
- **Dropped from the reference:** Check 3 (cross-cluster) and Check 4 (scope
  accuracy) — overkill at this repo size.
- **Short-circuit:** any Phase 0 Must Fix is presented immediately with a request
  to revise before Phase 1.

## Section C — Phase 1: Qualitative review (tiers)

### Tier 1 — Plan Quality (always)

- `concise-planning` — steps atomic, verb-first, concrete, with exact file paths.
- `code-review-checklist` — baseline structural check.
- `kaizen` — types over runtime checks, YAGNI, standardized work.

**Short-circuit:** any Tier 1 Must Fix is presented before deeper tiers.

### Tier 2 — Core Technical (always)

- `senior-architect` — architecture, maintainability, dependency analysis.
- `architecture-patterns` — applied to the bot's step-pipeline structure.
- `typescript-expert` — type-level correctness, strict-mode patterns.
- `nodejs-best-practices` — async patterns, Node security, architecture.
- `test-driven-development` — TDD compliance, red-green-refactor coverage.
- `lint-and-validate` — static analysis, project standards.

### Tier 3 — Bot-Specific Automation Review (always)

Inline criteria (not skills — none exist for this domain). Findings categorized
Must/Should/Consider like everything else.

1. **Selector robustness** — prefer role/text/stable-attribute locators over
   brittle CSS/XPath and index-based selection that breaks when the DOM shifts;
   new selectors live with their step.
2. **Wait & timing strategy** — rely on Playwright auto-waiting / web-first
   assertions / the shared `src/steps/wait.ts`; no bare `waitForTimeout`/sleep as
   the primary sync mechanism; correct navigation/network waits.
3. **Anti-detection / stealth** — changes must not regress stealth: keep
   `patchright` + `ghost-cursor` usage, human-like cursor/timing, consistent
   proxy/profile fingerprint; flag instant fills, missing mouse movement, or new
   automation fingerprints.
4. **Step-pipeline conventions** — new/changed steps follow the numbered
   convention (`NN-name.ts`), register in `steps/index.ts` / `walker.ts`, reuse
   shared `types.ts` / `actions.ts` / `wait.ts`; DOM *extraction* stays in
   `src/lib/parsers.ts`, separate from navigation logic.
5. **Resilience & observability** — transient-failure handling routed through
   `src/bot/errors.ts` / `runner.ts` / `pipeline.ts`; observability via
   `network-recorder` / `action-recorder` / `stats` preserved.
6. **Automation testing** — parser/pure-logic changes get unit tests against
   `tests/fixtures/*.html` (add/update fixtures when DOM parsing changes); flow
   changes exercise the mock-server (`mock:bot`); the plan must account for the
   `tsc` → `node --test dist/` build step (tests run on compiled output).

### Tier 4 — Conditional

Invoke only when the trigger matches:

- **Bug fix / regression** (`fix`/`bug`/`debug`/`regression`/`incident`/
  `error`/`broken`) → `systematic-debugging`.
- **Secrets / credentials** (`config.json`, `profiles/`, proxy creds,
  notification tokens, `.env`, "key", "rotation") → `secrets-management` +
  `vulnerability-scanner`.
- **Mock-server / HTTP test harness** (`src/mock-server/**`) →
  `backend-dev-guidelines` (the only HTTP surface in the repo).

### Pruned entirely (no basis in this stack)

All frontend skills (`frontend-developer`, `frontend-design`,
`frontend-security-coder`, `react-patterns`, `react-best-practices`,
`nextjs-best-practices`, `nextjs-app-router-patterns`, `tailwind-patterns`,
`ui-ux-pro-max`); `api-patterns`; `api-security-best-practices`;
`database-design`; `auth-implementation-patterns`; `backend-security-coder`;
`prompt-engineering`. `backend-dev-guidelines` is demoted from always-run to the
conditional mock-server trigger.

## Section D — Phase 2: Consolidated review summary

Present findings in three labelled sections:

1. **Code Graph Validation** — Phase 0 findings (or the SKIPPED note).
2. **Qualitative Review** — Tier 1, 2, and 4 findings.
3. **Bot-Specific Automation Review** — Tier 3 findings.

Each finding categorized **Must Fix** / **Should Fix** / **Consider**. Any Must
Fix in any section → the plan is **not approved**; revise and re-review.

## Out of scope

- Indexing this repo into GitNexus (Phase 0 degrades gracefully without it).
- Authoring any other skills.
- Changing the existing brainstorming/spec workflow.

## Open decisions resolved during brainstorming

- Scope: **prune inapplicable lenses + add bot-specific inline criteria.**
- Phase 0: **conditional with graceful skip** (not dropped, not mandatory).
- Argument input: **path-or-inline-text**, falling back to the in-context plan.
- Tier ordering: Bot-Specific after Core Technical (Tier 3), as presented.
