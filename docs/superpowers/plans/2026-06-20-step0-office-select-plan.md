# Step 0 Office-Select Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Barcelona step 0 match the manual office/trámite flow — stop the phantom "Cualquier oficina" re-select and replace it with an invisible read-only guard (`ensureAnyOffice`) that only touches `#sede` when the page loads with an unexpected default office.

**Architecture:** A new exported action factory `ensureAnyOffice(sedeValue)` in `src/steps/actions.ts` reads `#sede` via `inputValue()` (no click, no event) and early-returns in the normal case (already `99`). In the abnormal case it `console.warn`s and reuses the existing `select()` helper to correct the office — so the corrective branch fires `cargaTramites()` and the unchanged `waitForTramiteOptions` action waits it out. The step pipeline swaps the old `select('#sede', …)` line for `ensureAnyOffice(ANY_OFFICE_VALUE)`. The mock server is corrected to model the real page (`#sede` defaults to `99`, trámite pre-rendered) and gains a `MOCK_OFFICE_DEFAULT_EMPTY` env toggle so the corrective branch can be driven end-to-end via `npm run mock:bot`.

**Tech Stack:** TypeScript (strict, ES2020, CommonJS), Patchright (Playwright fork), `node:test` runner, ghost-cursor-playwright, a plain `http` mock server.

## Global Constraints

These apply to **every** task. Exact values copied from the spec and verified against the repo.

- **Reuse `select()` — never inline.** The corrective branch MUST call `await select('#sede', { value: sedeValue })(args)` (the existing helper at `src/steps/actions.ts:19`). Do NOT inline `cursor.click('#sede')` + `page.selectOption(...)` — that duplicates `select()` and risks drift. (Spec §4.2.)
- **Invisible read.** The normal-case read MUST be `await page.locator('#sede').inputValue()` — no click, no dispatched event. (Spec §4.2.)
- **Unchanged constants** (already in `src/steps/00-selectRegion.ts`): `ANY_OFFICE_VALUE = '99'`, `TRAMITE_SELECT = '#tramiteGrupo\\[0\\]'`. Do not rename or relocate them. (Spec §4.1.)
- **Canonical trámite label** (used in fixtures and tests, copied verbatim from `src/tests/integration/flow.test.ts:18`):
  `POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013`
- **No new app config flags.** `MOCK_OFFICE_DEFAULT_EMPTY` is a mock-server **env toggle** only — same class as the existing `MOCK_NO_CITA`. It is NOT app config and must not touch `config.json` or the config schema. (Spec §5, §4.5.)
- **Action label MUST be `ensureAnyOffice`** so `PagePipeline.execute` logs `[Action N/M] ensureAnyOffice` (spec §6 verifies this string is present/absent in logs).
- **Do NOT modify `tests/fixtures/bcn_combined.html`.** The existing flow test (`src/tests/integration/flow.test.ts`, "Combined office + tramite page") depends on it modelling the *empty* default. Spec §6: existing flow test must stay green/unaffected.
- **Build:** `npm run build` (alias for `tsc`, `rootDir: src` → `outDir: dist`). **Tests:** compile first, then `node --test "dist/tests/**/*.test.js"`.
- **Type/lint gate:** `npx tsc --noEmit`. ⚠️ The spec mentions `npm run lint`, **but this repo has no `lint` script and no eslint config** (verified: `package.json` scripts + no `.eslintrc`/`eslint.config.*`). Use `npx tsc --noEmit` as the gate; do **not** invent a lint script.
- **Baseline (cold-start truth):** on a clean `improvements` branch the build is green and `node --test "dist/tests/**/*.test.js"` reports **32 pass / 0 fail**. Every phase must leave this ≥ green (more tests, still 0 fail).

---

## Cross-Phase Dependency Order

Strictly sequential. Each phase ends green + committed and is resumable cold.

| Phase | Title | Depends on | Why the order |
|-------|-------|-----------|---------------|
| 1 | `ensureAnyOffice` invisible guard + wire into step 0 | baseline only | The behavioural core; ships a working step. Independent of the mock. |
| 2 | Mock-server fidelity (§4.4) + corrective toggle (§4.5) | Phase 1 | The mock's purpose is to drive the two branches of the Phase-1 action via `npm run mock:bot`; its happy path requires the new step behaviour to exist. |

**Doc hygiene (spec §7) is already complete** — no phase needed. Verified: `docs/superpowers/specs/2026-06-19-citabot-barcelona-notify-design.md` §4 step-0 row (line 53) and §11 `cargaTramites()` timing (lines 231–234) already describe the invisible-guard behaviour (folded in by commit `a7be59a`). Phase 2's final step re-verifies this so nothing is silently assumed.

```
Phase 1  ──►  Phase 2
(action)      (mock fidelity + toggle)
```

---

## File Structure

| File | Phase | Responsibility |
|------|-------|----------------|
| `src/steps/actions.ts` | 1 | Add exported `ensureAnyOffice(sedeValue)` factory (lives next to `select()`, which it reuses). |
| `src/steps/00-selectRegion.ts` | 1 | Swap office `select()` line for `ensureAnyOffice(ANY_OFFICE_VALUE)`; import it. |
| `tests/fixtures/bcn_office_default99.html` | 1 | NEW fixture: real page shape (`#sede` defaults `99`, trámite pre-rendered). Drives the normal-branch test. |
| `src/tests/integration/ensureAnyOffice.test.ts` | 1 | NEW: drives `ensureAnyOffice` with Patchright over both branches. |
| `src/tests/unit/selectRegionStep.test.ts` | 1 | NEW: asserts step-0 pipeline composition (label present/absent + ordering). |
| `mock-server/pages/bcn_combined.html` | 2 | CORRECT to model real page (`#sede` default `99`, trámite pre-rendered). |
| `mock-server/pages/bcn_combined_empty.html` | 2 | NEW variant: empty default (pre-§4.4 behaviour) for the corrective path. |
| `src/mock-server/index.ts` | 2 | Add exported `combinedPageFile()` + `MOCK_OFFICE_DEFAULT_EMPTY` routing; guard `server.listen` behind `require.main === module` for testability. |
| `src/tests/integration/mockPages.test.ts` | 2 | NEW: asserts each mock page's on-load `#sede` default + trámite presence. |
| `src/tests/unit/mockServer.test.ts` | 2 | NEW: asserts `combinedPageFile(toggle)` filename routing. |

---

# Phase 1 — `ensureAnyOffice` invisible guard + wire into step 0

**Prerequisites / cold-start state:**
- On branch `improvements`. `git status` clean.
- `npm run build` exits 0; `node --test "dist/tests/**/*.test.js"` → **32 pass / 0 fail**.
- `src/steps/00-selectRegion.ts:39` currently reads `select('#sede', { value: ANY_OFFICE_VALUE }),` (the line being replaced).
- `src/steps/actions.ts` currently exports `label, move, click, scroll, select, typeChars, press, moveRandom` and a module-private `withLabel`. No `ensureAnyOffice` yet.
- Nothing from later phases exists.

**Parallelism within this phase:** Task 1.1 (new fixture file) is independent of everything and may be done first or in parallel. Task 1.2 depends on 1.1's fixture for its normal-branch test. Task 1.3 depends on 1.2 (needs the exported `ensureAnyOffice`). Do **1.1 → 1.2 → 1.3**.

---

### Task 1.1: Normal-default test fixture

**Files:**
- Create: `tests/fixtures/bcn_office_default99.html`

This fixture models the **corrected real page**: Barcelona's `#sede` already defaults to `Cualquier oficina` (`99`) and the toma-de-huellas trámite is pre-rendered on load. `cargaTramites()`/`onchange` are kept wired (harmless, mirrors the live page) so the same file could also exercise a change if needed.

- [ ] **Step 1: Create the fixture**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Oficina y trámite (default 99)</title></head>
<body>
<div id="cookieBanner">
    <button type="button" id="cookieAccept" onclick="document.getElementById('cookieBanner').style.display='none'">Acepto</button>
</div>
<form name="datosCita" action="/icpplustieb/advance" method="post">
    <select id="sede" name="sede" onchange="cargaTramites()">
        <option value="">Seleccione oficina...</option>
        <option value="99" selected>Cualquier oficina</option>
    </select>
    <select id="tramiteGrupo[0]" name="tramiteGrupo[0]">
        <option value="">Seleccione...</option>
        <option value="1">POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013</option>
    </select>
    <input id="btnAceptar" type="button" value="Aceptar" onclick="document.forms['datosCita'].submit()">
</form>
<script>
function cargaTramites() {
    var sel = document.getElementById('sede');
    var tg = document.getElementById('tramiteGrupo[0]');
    tg.innerHTML = '<option value="">Seleccione...</option>';
    if (sel.value) {
        setTimeout(function () {
            var opt = document.createElement('option');
            opt.value = '1';
            opt.text = 'POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013';
            tg.appendChild(opt);
        }, 150);
    }
}
</script>
</body>
</html>
```

- [ ] **Step 2: Sanity-check the file is well-formed**

Run: `node -e "const h=require('fs').readFileSync('tests/fixtures/bcn_office_default99.html','utf8'); console.log(/value=\"99\" selected/.test(h), /tramiteGrupo\[0\]/.test(h))"`
Expected: `true true`

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/bcn_office_default99.html
git commit -m "test(step0): add default-99 fixture for ensureAnyOffice normal path"
```

---

### Task 1.2: `ensureAnyOffice` action (TDD)

**Files:**
- Create: `src/tests/integration/ensureAnyOffice.test.ts`
- Modify: `src/steps/actions.ts` (add `ensureAnyOffice` export after `select`)

**Interfaces:**
- Consumes: `select(selector, opts)` and the module-private `withLabel(action, label)` — both already in `src/steps/actions.ts`. `Action` type from `../bot/pipeline`. Type-only `HumanCursor` (`../../bot/cursor`), `HumanKeyboard` (`../../bot/keyboard`) for typing the recording stubs (the test does NOT instantiate real ghost-cursor — see note below).
- Produces (relied on by Task 1.3): `export const ensureAnyOffice: (sedeValue: string) => Action`, returning a labelled action whose `.label === 'ensureAnyOffice'`.

> **Why a recording stub cursor (regression-guard rationale):** The whole point of this change (spec §2/§3) is *"do not touch the office in the normal case."* A normal-path test that only asserts `#sede === '99'` + `warn === 0` is **green against the very bug being removed** — the old `select('#sede', { value: '99' })` also leaves `#sede` at `99` and never warns. So the normal test MUST assert that the office received **no interaction** (no `cursor.click`, no `change` event) — a property the phantom-select violates. We use a recording stub cursor (`select()` only calls `cursor.click`) so the decision logic is tested without depending on ghost-cursor's real pointer motion; `page.selectOption` still runs for real, so the value change + `change` event are genuine. The real human-click choreography of `select()` is exercised end-to-end by `npm run mock:bot` in Phase 2.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/ensureAnyOffice.test.ts`:

```typescript
/**
 * Integration tests for ensureAnyOffice: drive fixture HTML with Patchright.
 * Normal branch:     #sede already 99 -> NO click, NO change event, NO warn (the stealth contract).
 * Corrective branch: #sede empty      -> console.warn + select('#sede', {value:'99'}) (one #sede click)
 *                                          -> selectOption fires change -> cargaTramites repopulates.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import * as fs from 'fs'
import { chromium, type Page } from 'patchright'
import { ensureAnyOffice } from '../../steps/actions'
import type { HumanCursor } from '../../bot/cursor'
import type { HumanKeyboard } from '../../bot/keyboard'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')
const TRAMITE_LABEL =
    'POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013'

async function loadFixture(name: string): Promise<string> {
    return fs.promises.readFile(path.join(FIXTURES, `${name}.html`), 'utf-8')
}

/** Recording stand-ins for the pipeline args. select() only calls cursor.click(selector). */
function makeArgs(page: Page) {
    const clicks: string[] = []
    const cursor = { click: async (selector: string) => { clicks.push(selector) } } as unknown as HumanCursor
    const keyboard = {} as unknown as HumanKeyboard
    return { args: { page, cursor, keyboard }, clicks }
}

/** Record whether #sede ever fires a change event — what a WAF would observe. */
async function trackSedeChange(page: Page): Promise<void> {
    await page.evaluate(() => {
        ;(window as unknown as { __sedeChanged: boolean }).__sedeChanged = false
        document.querySelector('#sede')!
            .addEventListener('change', () => { (window as unknown as { __sedeChanged: boolean }).__sedeChanged = true })
    })
}
const sedeChanged = (page: Page) =>
    page.evaluate(() => (window as unknown as { __sedeChanged: boolean }).__sedeChanged === true)

let browser: Awaited<ReturnType<typeof chromium.launch>>
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

describe('ensureAnyOffice', () => {
    it('normal default (#sede=99): reads invisibly — no click, no change event, no warn', async (t) => {
        const page = await browser.newPage()
        await page.setContent(await loadFixture('bcn_office_default99'), { waitUntil: 'domcontentloaded' })
        await trackSedeChange(page)
        const warn = t.mock.method(console, 'warn', () => {})
        const { args, clicks } = makeArgs(page)

        await ensureAnyOffice('99')(args)

        assert.strictEqual(clicks.length, 0, 'office must NOT be clicked in the normal case (the bug being removed)')
        assert.strictEqual(await sedeChanged(page), false, 'office must NOT fire a change event')
        assert.strictEqual(warn.mock.callCount(), 0, 'normal path must not warn')
        assert.strictEqual(await page.locator('#sede').inputValue(), '99')
        await page.close()
    })

    it('abnormal default (#sede empty): warns and corrects the office, firing cargaTramites', async (t) => {
        const page = await browser.newPage()
        await page.setContent(await loadFixture('bcn_combined'), { waitUntil: 'domcontentloaded' })
        assert.strictEqual(await page.locator('#sede').inputValue(), '', 'precondition: empty default')
        await trackSedeChange(page)
        const warn = t.mock.method(console, 'warn', () => {})
        const { args, clicks } = makeArgs(page)

        await ensureAnyOffice('99')(args)

        assert.strictEqual(warn.mock.callCount(), 1, 'corrective path must warn exactly once')
        assert.deepStrictEqual(clicks, ['#sede'], 'corrective path reuses select() → exactly one click on #sede')
        assert.strictEqual(await page.locator('#sede').inputValue(), '99', 'office corrected to Cualquier oficina')
        assert.strictEqual(await sedeChanged(page), true, 'selecting the office fired change → cargaTramites')
        // cargaTramites() re-ran; the trámite option (re)appears (attached, matched by label).
        await page
            .locator('#tramiteGrupo\\[0\\]')
            .locator('option', { hasText: TRAMITE_LABEL })
            .waitFor({ state: 'attached', timeout: 5000 })
        await page.close()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build`
Expected: **FAIL** — `tsc` errors with `Module '"../../steps/actions"' has no exported member 'ensureAnyOffice'.` (the symbol does not exist yet).
After the symbol exists (Step 3), the discriminating red is behavioural: the **corrective** test's `#sede === '99'` / `clicks === ['#sede']` assertions fail against any no-op, and the **normal** test's `clicks.length === 0` / `sedeChanged === false` assertions fail against the old phantom-select — so each test fails for the right reason.

- [ ] **Step 3: Write the minimal implementation**

In `src/steps/actions.ts`, add the factory immediately **after** the `select` export (it depends on `select` and `withLabel`, both defined above it):

```typescript
/**
 * Invisible office guard for Barcelona step 0. Reads #sede WITHOUT interacting (no click, no
 * dispatched event — the WAF sees nothing). In the normal case the office is already
 * "Cualquier oficina" so this does nothing and the next control the bot touches is the trámite
 * dropdown, exactly the manual flow. In the abnormal case it warns and reuses select() to correct
 * the office (firing cargaTramites()); the pipeline's next action waits the trámite list out.
 *
 * Reuses select() on purpose so the one human-click-then-selectOption choreography (and any future
 * stealth tweaks to select()) live in a single place. Do NOT inline cursor.click + selectOption.
 */
export const ensureAnyOffice = (sedeValue: string): Action =>
    withLabel(
        async (args) => {
            const current = await args.page.locator('#sede').inputValue();
            if (current === sedeValue) return;
            console.warn(
                `[ensureAnyOffice] Unexpected default office '${current}' (expected '${sedeValue}'); selecting #sede = "Cualquier oficina"`
            );
            await select('#sede', { value: sedeValue })(args);
        },
        'ensureAnyOffice'
    );
```

> Note on the spec's shorthand: spec §4.2 writes `await select('#sede', { value: ANY_OFFICE_VALUE })(ctx)`. A pipeline action actually receives `ActionArgs` (`{ page, cursor, keyboard }`), not the step `ctx`. The implementation above passes `args` (the `ActionArgs` this action received) — that is the faithful realisation of the spec's intent. `args` is contextually typed as `ActionArgs` via `withLabel<T extends Action>`, matching how `move`/`click` already destructure their parameter.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run build && node --test dist/tests/integration/ensureAnyOffice.test.js`
Expected: **PASS** — `# pass 2`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/steps/actions.ts src/tests/integration/ensureAnyOffice.test.ts
git commit -m "feat(step0): add ensureAnyOffice invisible office guard (TDD)"
```

---

### Task 1.3: Wire `ensureAnyOffice` into step 0 (TDD)

**Files:**
- Create: `src/tests/unit/selectRegionStep.test.ts`
- Modify: `src/steps/00-selectRegion.ts` (import + pipeline line)

**Interfaces:**
- Consumes: `ensureAnyOffice` (Task 1.2), `selectRegionStep` (`src/steps/00-selectRegion.ts`), `StepContext`/`StepDataKey` (`src/steps/types.ts`).
- Produces: nothing new for later phases — this finalises step 0's runtime behaviour.

- [ ] **Step 1: Write the failing test**

`selectRegionStep.actions(ctx)` only reads `ctx.config.tramiteLabel` and `ctx.data[StepDataKey.CookieBannerVisible]` to *build* the (lazy) action array — it needs no live page/cursor. So we can assert pipeline composition with a stub context.

Create `src/tests/unit/selectRegionStep.test.ts`:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { selectRegionStep } from '../../steps/00-selectRegion'
import type { StepContext } from '../../steps/types'

function labelsFor(cookieVisible: boolean): string[] {
    const ctx = {
        config: { tramiteLabel: 'SOME-TRÁMITE' },
        data: { cookieBannerVisible: cookieVisible },
    } as unknown as StepContext
    return selectRegionStep.actions(ctx).map((a) => (a as { label?: string }).label ?? '')
}

describe('selectRegionStep pipeline composition', () => {
    it('uses the invisible ensureAnyOffice guard, not an office select', () => {
        const labels = labelsFor(false)
        assert.ok(labels.includes('ensureAnyOffice'), `expected ensureAnyOffice in ${JSON.stringify(labels)}`)
        assert.ok(
            !labels.some((l) => l.startsWith('select(#sede')),
            `office must not be selected directly: ${JSON.stringify(labels)}`
        )
    })

    it('still selects the trámite and clicks Aceptar', () => {
        const labels = labelsFor(false)
        assert.ok(labels.some((l) => l.startsWith('select(#tramiteGrupo')), 'trámite select present')
        assert.ok(labels.includes('move(#btnAceptar)'), 'move to Aceptar present')
        assert.ok(labels.includes('click(#btnAceptar)'), 'click Aceptar present')
    })

    it('guards the office before waiting for / selecting the trámite', () => {
        const labels = labelsFor(false)
        const guardIdx = labels.indexOf('ensureAnyOffice')
        const tramiteIdx = labels.findIndex((l) => l.startsWith('select(#tramiteGrupo'))
        assert.ok(guardIdx >= 0 && tramiteIdx >= 0 && guardIdx < tramiteIdx, `order wrong: ${JSON.stringify(labels)}`)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test dist/tests/unit/selectRegionStep.test.js`
Expected: **FAIL** — the first test fails: `ensureAnyOffice` is absent and `select(#sede, 99)` is present (current pipeline still has the office select).

- [ ] **Step 3: Write the implementation**

In `src/steps/00-selectRegion.ts`, update the import on line 4 to add `ensureAnyOffice`:

```typescript
import { move, click, label, select, moveRandom, ensureAnyOffice } from './actions';
```

Then replace the office-select line in the pipeline (currently `select('#sede', { value: ANY_OFFICE_VALUE }),`) with the guard. The pipeline block becomes:

```typescript
            moveRandom(),
            ensureAnyOffice(ANY_OFFICE_VALUE),
            label(
                // An <option> in a closed <select> has an empty bounding box, so it is never
                // 'visible' to Playwright — a default waitForSelector would hang for the full
                // SELECTOR_TIMEOUT_MS every poll cycle. Wait for the target tramite option to be
                // ATTACHED (present in DOM), matched by its label rather than by position.
                (({ page }) =>
                    page
                        .locator(TRAMITE_SELECT)
                        .locator('option', { hasText: ctx.config.tramiteLabel })
                        .waitFor({ state: 'attached', timeout: SELECTOR_TIMEOUT_MS })) as Action,
                'waitForTramiteOptions'
            ),
            select(TRAMITE_SELECT, { label: ctx.config.tramiteLabel }),
            move('#btnAceptar'),
            click('#btnAceptar'),
```

(`select` stays imported — it is still used for the trámite dropdown. `waitForTramiteOptions` is unchanged per spec §4.3.)

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npm run build && node --test dist/tests/unit/selectRegionStep.test.js`
Expected: **PASS** — `# pass 3`, `# fail 0`.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm run build && node --test "dist/tests/**/*.test.js"`
Expected: **PASS** — `# fail 0`. Total is the baseline 32 + 2 (Task 1.2) + 3 (Task 1.3) = **37 pass**.

- [ ] **Step 6: Type-check gate**

Run: `npx tsc --noEmit`
Expected: exits 0, no output.

- [ ] **Step 7: Commit**

```bash
git add src/steps/00-selectRegion.ts src/tests/unit/selectRegionStep.test.ts
git commit -m "feat(step0): wire ensureAnyOffice into RegionSelect pipeline (TDD)"
```

**Phase 1 done.** Build green; 37 tests pass; step 0 no longer touches the office in the normal case. Safe to stop here.

---

# Phase 2 — Mock-server fidelity (§4.4) + corrective toggle (§4.5)

**Prerequisites / cold-start state:**
- Phase 1 committed: `src/steps/actions.ts` exports `ensureAnyOffice`; `src/steps/00-selectRegion.ts:` pipeline contains `ensureAnyOffice(ANY_OFFICE_VALUE)` (no `select('#sede', …)`).
- `npm run build` green; `node --test "dist/tests/**/*.test.js"` → **37 pass / 0 fail**.
- `mock-server/pages/bcn_combined.html` still models the **wrong** assumption (`#sede` defaults empty, `#tramiteGrupo[0]` empty until `cargaTramites()` fires).
- `src/mock-server/index.ts` reads `MOCK_NO_CITA` at top level, maps step 0 → `'bcn_combined.html'` in `pageForStep`, and calls `server.listen(...)` unconditionally at module load. There is no `MOCK_OFFICE_DEFAULT_EMPTY` and no `combinedPageFile` export yet.

**Parallelism within this phase:** Task 2.1 (correct `bcn_combined.html`) and Task 2.2 (create `bcn_combined_empty.html`) touch different files and are independent — safe to do in parallel. Task 2.3 (server routing) depends on the `bcn_combined_empty.html` filename existing (Task 2.2). Do **2.1 ∥ 2.2 → 2.3**.

---

### Task 2.1: Correct the mock combined page to model the real default (TDD)

**Files:**
- Create: `src/tests/integration/mockPages.test.ts`
- Modify: `mock-server/pages/bcn_combined.html`

**Interfaces:**
- Consumes: nothing from code — reads the HTML files from disk via Patchright `setContent`.
- Produces: the corrected `bcn_combined.html` consumed at runtime by `src/mock-server/index.ts` step-0 routing.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/mockPages.test.ts` (it will also host Task 2.2's assertion — add the empty-variant block in Task 2.2):

```typescript
/**
 * Fidelity tests for the mock-server combined page(s): assert the ON-LOAD office default and
 * trámite presence, with no interaction — mirroring what ensureAnyOffice reads on the real page.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import * as fs from 'fs'
import { chromium } from 'patchright'

const PAGES = path.join(process.cwd(), 'mock-server', 'pages')
const TRAMITE_LABEL =
    'POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013'

async function loadPage(file: string): Promise<string> {
    return fs.promises.readFile(path.join(PAGES, file), 'utf-8')
}

let browser: Awaited<ReturnType<typeof chromium.launch>>
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

describe('mock page bcn_combined.html (real-page fidelity)', () => {
    it('defaults #sede to 99 and pre-renders the toma-de-huellas trámite on load', async () => {
        const page = await browser.newPage()
        await page.setContent(await loadPage('bcn_combined.html'), { waitUntil: 'domcontentloaded' })
        assert.strictEqual(await page.locator('#sede').inputValue(), '99', '#sede must default to Cualquier oficina')
        // No interaction: the trámite option must already be attached on load.
        await page
            .locator('#tramiteGrupo\\[0\\]')
            .locator('option', { hasText: TRAMITE_LABEL })
            .waitFor({ state: 'attached', timeout: 2000 })
        await page.close()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test dist/tests/integration/mockPages.test.js`
Expected: **FAIL** — `#sede` reads `''` (current file has no `selected` on `99`) so the `assert.strictEqual(..., '99', ...)` fails; the trámite `waitFor` would also time out.

- [ ] **Step 3: Correct the mock page**

Overwrite `mock-server/pages/bcn_combined.html` with the real-page model (default `99`, trámite pre-rendered). `cargaTramites()` + `onchange` stay wired so the corrective branch remains exercisable (§4.4) but are no longer required for the happy path:

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Oficina y trámite</title></head>
<body>
<div id="cookieBanner" style="padding:8px;background:#eee;margin:5px">
    <button type="button" id="cookieAccept" onclick="document.getElementById('cookieBanner').style.display='none'">Acepto</button>
</div>
<form name="datosCita" action="/icpplustieb/advance" method="post">
    <select id="sede" name="sede" onchange="cargaTramites()">
        <option value="">Seleccione oficina...</option>
        <option value="99" selected>Cualquier oficina</option>
    </select>
    <select id="tramiteGrupo[0]" name="tramiteGrupo[0]">
        <option value="">Seleccione...</option>
        <option value="1">POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013</option>
    </select>
    <input id="btnAceptar" type="button" value="Aceptar" onclick="document.forms['datosCita'].submit()">
</form>
<script>
function cargaTramites() {
    var sel = document.getElementById('sede');
    var tg = document.getElementById('tramiteGrupo[0]');
    tg.innerHTML = '<option value="">Seleccione...</option>';
    if (sel.value) {
        setTimeout(function () {
            var opt = document.createElement('option');
            opt.value = '1';
            opt.text = 'POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013';
            tg.appendChild(opt);
        }, 150);
    }
}
</script>
</body>
</html>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run build && node --test dist/tests/integration/mockPages.test.js`
Expected: **PASS** — `# pass 1`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add mock-server/pages/bcn_combined.html src/tests/integration/mockPages.test.ts
git commit -m "test(mock): model real page in bcn_combined.html (#sede=99, trámite pre-rendered)"
```

---

### Task 2.2: Empty-default variant page for the corrective path (TDD)

**Files:**
- Create: `mock-server/pages/bcn_combined_empty.html`
- Modify: `src/tests/integration/mockPages.test.ts` (add the variant assertion)

**Interfaces:**
- Consumes: nothing from code.
- Produces: `bcn_combined_empty.html` — the filename Task 2.3's `combinedPageFile(true)` returns.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/integration/mockPages.test.ts` (after the existing `describe`):

```typescript
describe('mock page bcn_combined_empty.html (corrective-path variant)', () => {
    it('defaults #sede to the empty placeholder and leaves the trámite list empty on load', async () => {
        const page = await browser.newPage()
        await page.setContent(await loadPage('bcn_combined_empty.html'), { waitUntil: 'domcontentloaded' })
        assert.strictEqual(await page.locator('#sede').inputValue(), '', '#sede must default to the empty placeholder')
        const optionCount = await page.locator('#tramiteGrupo\\[0\\] option').count()
        assert.strictEqual(optionCount, 1, 'only the "Seleccione..." placeholder before cargaTramites fires')
        await page.close()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test dist/tests/integration/mockPages.test.js`
Expected: **FAIL** — `ENOENT` reading `bcn_combined_empty.html` (file does not exist yet).

- [ ] **Step 3: Create the variant page**

Create `mock-server/pages/bcn_combined_empty.html` (pre-§4.4 behaviour: empty default, trámite populated only after `cargaTramites()` fires):

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Oficina y trámite (default empty)</title></head>
<body>
<div id="cookieBanner" style="padding:8px;background:#eee;margin:5px">
    <button type="button" id="cookieAccept" onclick="document.getElementById('cookieBanner').style.display='none'">Acepto</button>
</div>
<form name="datosCita" action="/icpplustieb/advance" method="post">
    <select id="sede" name="sede" onchange="cargaTramites()">
        <option value="">Seleccione oficina...</option>
        <option value="99">Cualquier oficina</option>
    </select>
    <select id="tramiteGrupo[0]" name="tramiteGrupo[0]">
        <option value="">Seleccione...</option>
    </select>
    <input id="btnAceptar" type="button" value="Aceptar" onclick="document.forms['datosCita'].submit()">
</form>
<script>
function cargaTramites() {
    var sel = document.getElementById('sede');
    var tg = document.getElementById('tramiteGrupo[0]');
    tg.innerHTML = '<option value="">Seleccione...</option>';
    if (sel.value) {
        setTimeout(function () {
            var opt = document.createElement('option');
            opt.value = '1';
            opt.text = 'POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013';
            tg.appendChild(opt);
        }, 150);
    }
}
</script>
</body>
</html>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run build && node --test dist/tests/integration/mockPages.test.js`
Expected: **PASS** — `# pass 2`, `# fail 0` (the §2.1 default-99 test + this variant test).

- [ ] **Step 5: Commit**

```bash
git add mock-server/pages/bcn_combined_empty.html src/tests/integration/mockPages.test.ts
git commit -m "test(mock): add empty-default variant page for the corrective branch"
```

---

### Task 2.3: `MOCK_OFFICE_DEFAULT_EMPTY` routing in the mock server (TDD)

**Files:**
- Create: `src/tests/unit/mockServer.test.ts`
- Modify: `src/mock-server/index.ts`

**Interfaces:**
- Consumes: the two page files from Tasks 2.1/2.2 at runtime.
- Produces: `export function combinedPageFile(officeDefaultEmpty: boolean): string` returning `'bcn_combined_empty.html'` when `true`, `'bcn_combined.html'` when `false`. Used by `pageForStep` for step 0.

> Why this seam: `combinedPageFile` is a pure, importable function — testable without booting the HTTP server. We also guard `server.listen` behind `require.main === module` so importing the module in a test does not bind a port. The routing change stays in `src/mock-server/index.ts` per spec §4.5.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/mockServer.test.ts`:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { combinedPageFile } from '../../mock-server/index'

describe('combinedPageFile', () => {
    it('serves the real default-99 page when the toggle is off', () => {
        assert.strictEqual(combinedPageFile(false), 'bcn_combined.html')
    })
    it('serves the empty-default variant when MOCK_OFFICE_DEFAULT_EMPTY is on', () => {
        assert.strictEqual(combinedPageFile(true), 'bcn_combined_empty.html')
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test dist/tests/unit/mockServer.test.js`
Expected: **FAIL** — `tsc` errors: `Module '"../../mock-server/index"' has no exported member 'combinedPageFile'.`

- [ ] **Step 3: Implement the toggle + export + boot guard**

In `src/mock-server/index.ts`:

1. Add the env read next to the existing `MOCK_NO_CITA` (near line 17):

```typescript
const MOCK_NO_CITA = process.env.MOCK_NO_CITA === '1'
const MOCK_OFFICE_DEFAULT_EMPTY = process.env.MOCK_OFFICE_DEFAULT_EMPTY === '1'
```

2. Add the exported pure helper (place it just above `pageForStep`):

```typescript
/** Step-0 combined page: the empty-default variant drives ensureAnyOffice's corrective branch. */
export function combinedPageFile(officeDefaultEmpty: boolean): string {
    return officeDefaultEmpty ? 'bcn_combined_empty.html' : 'bcn_combined.html'
}
```

3. In `pageForStep`, replace the hard-coded step-0 entry so it routes via the helper. The `files` map becomes:

```typescript
    const files: Record<number, string> = {
        0: combinedPageFile(MOCK_OFFICE_DEFAULT_EMPTY),
        1: 'bcn_entrar.html',
        2: 'bcn_nie.html',
        3: 'bcn_confirm.html',
        4: MOCK_NO_CITA ? 'bcn_no_citas.html' : 'bcn_citas_available.html',
    }
```

4. Guard the server boot so importing the module in a test does not bind a port. Wrap the existing `server.listen(PORT, () => { … })` block:

```typescript
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Mock server (Barcelona watcher) running at http://localhost:${PORT}`)
        console.log(`  GET  /icpplustieb/citar   - reset + serve combined office/tramite page (step 0)`)
        console.log(`  POST /icpplustieb/advance - advance step, redirect to /icpplustieb/page`)
        console.log(`  GET  /icpplustieb/page    - serve current step page`)
        if (MOCK_NO_CITA) console.log(`  (MOCK_NO_CITA=1: serving no-citas at the result step)`)
        if (MOCK_OFFICE_DEFAULT_EMPTY) console.log(`  (MOCK_OFFICE_DEFAULT_EMPTY=1: serving empty-default office at step 0)`)
    })
}
```

(`npm run mock:server` runs `node dist/mock-server/index.js`, where `require.main === module` is `true`, so the server still boots normally.)

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npm run build && node --test dist/tests/unit/mockServer.test.js`
Expected: **PASS** — `# pass 2`, `# fail 0`.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm run build && node --test "dist/tests/**/*.test.js"`
Expected: **PASS** — `# fail 0`. Total: 37 (after Phase 1) + 2 (Task 2.1/2.2 integration) + 2 (Task 2.3 unit) = **41 pass**.

- [ ] **Step 6: Type-check gate**

Run: `npx tsc --noEmit`
Expected: exits 0, no output.

- [ ] **Step 7: Manual verification — normal happy path (spec §6)**

Run: `npm run mock:bot`
Expected in step-0 logs: a `[Action N/M] ensureAnyOffice` line is **present**; there is **no** `select(#sede…)` line and **no** `[ensureAnyOffice] Unexpected default office…` warn (the office was read invisibly, never selected). The trámite is selected, `click(#btnAceptar)` runs, and the flow advances to entrar. Stop the run (Ctrl-C) once it advances past step 0.

- [ ] **Step 8: Manual verification — corrective path (spec §6, proves Approach B's branch)**

Run: `MOCK_OFFICE_DEFAULT_EMPTY=1 npm run mock:bot`
Expected in step-0 logs: the `[ensureAnyOffice] Unexpected default office '' (expected '99'); selecting #sede = "Cualquier oficina"` **warn appears**, the office is corrected to Cualquier oficina, `cargaTramites()` repopulates the trámite list, `waitForTramiteOptions` resolves, the trámite is selected, `click(#btnAceptar)` runs, and the flow advances. Stop the run once it advances past step 0.
> Note: the corrective `select('#sede', …)` runs **inside** `ensureAnyOffice`, not as its own pipeline action — so the pipeline only logs `[Action N/M] ensureAnyOffice`, **not** a separate `[Action] select(#sede…)` line. The `console.warn` above is the corrective-path signal (this is what spec §6's "logs show … a `select(#sede…)`" means here). Do not wait for a `select(#sede…)` pipeline line; it will not appear.

- [ ] **Step 9: Verify doc hygiene (spec §7) is already satisfied — no edit expected**

Run: `grep -n "invisible-guard" docs/superpowers/specs/2026-06-19-citabot-barcelona-notify-design.md`
Expected: a hit on the §4 step-0 row (line ~53). Also confirm §11 mentions the default-office trámite-on-load timing (line ~231). If both are present (they are, via commit `a7be59a`), spec §7 needs no change. If — unexpectedly — they are absent, update those two sections to describe the invisible-guard behaviour (§4.2 of the step-0 design) and commit separately; otherwise skip.

- [ ] **Step 10: Commit**

```bash
git add src/mock-server/index.ts src/tests/unit/mockServer.test.ts
git commit -m "feat(mock): MOCK_OFFICE_DEFAULT_EMPTY toggle to drive the corrective office branch"
```

**Phase 2 done.** Build green; 41 tests pass; mock server models the real page and can drive both branches; doc hygiene verified. Implementation complete.

---

## Self-Review (author checklist — completed)

**Spec coverage:**
- §3 Approach B (invisible guard, correct only in abnormal case) → Task 1.2 `ensureAnyOffice`.
- §4.1 pipeline swap (`select('#sede', …)` → `ensureAnyOffice`) → Task 1.3.
- §4.2 invisible read + reuse `select()` + no inlining + `#sede` guaranteed present → Task 1.2 impl + Global Constraints.
- §4.3 `waitForTramiteOptions` unchanged → Task 1.3 (block kept verbatim).
- §4.4 mock `bcn_combined.html` fidelity (default 99, trámite pre-rendered, `cargaTramites` kept) → Task 2.1.
- §4.5 `MOCK_OFFICE_DEFAULT_EMPTY` variant + routing in `index.ts` → Task 2.2 + 2.3.
- §5 out-of-scope / no new app config → Global Constraints (toggle is env-only).
- §6 testing: TS build clean (every phase), normal-path mock run (2.3 Step 7), corrective-path mock run written test-first (the integration test in 1.2 fails before `ensureAnyOffice` exists; manual run in 2.3 Step 8), `npm test` stays green (1.3 Step 5, 2.3 Step 5).
- §7 doc hygiene → already done; verified in 2.3 Step 9 (no redundant edit).

**Placeholder scan:** none — all code, fixtures, and commands are concrete.

**Type/name consistency:** `ensureAnyOffice(sedeValue: string): Action` (defined 1.2, consumed 1.3); label string `'ensureAnyOffice'` consistent across impl, the composition test, and the §6 log expectations; `combinedPageFile(officeDefaultEmpty: boolean): string` (defined 2.3, tested 2.3); trámite label string identical across all fixtures and tests; `ANY_OFFICE_VALUE`/`TRAMITE_SELECT` untouched.

**OPEN QUESTIONS:** none. One deliberate implementation choice flagged inline (Task 1.2 Step 3 note): `ensureAnyOffice` is an **exported factory in `actions.ts`** rather than an inline closure in the step. This honours the spec's settled decisions (reuse `select()`, single place, normal case touches nothing) while giving the TDD requirement a clean importable seam; it does not reopen any design question.
