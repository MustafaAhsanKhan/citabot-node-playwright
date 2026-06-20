# Step 0 — match the manual office/trámite flow

**Date:** 2026-06-20
**Status:** Approved (brainstorming) — ready for implementation plan
**Supersedes:** the office-select behaviour described in
`2026-06-19-citabot-barcelona-notify-design.md` §4 (step 0 row) and §11
(`cargaTramites()` timing risk). Those sections are updated in place to match.

## 1. Goal

Make Barcelona step 0 (`StepId.RegionSelect`, `src/steps/00-selectRegion.ts`)
do exactly what the user does by hand on the entry page, and nothing more.

Entry page: `https://icp.administracionelectronica.gob.es/icpplustieb/citar?p=8&locale=es`
— Barcelona is already pre-selected, the office dropdown already defaults to
**"Cualquier oficina"** (`#sede` value `99`), and the trámite list
(`#tramiteGrupo[0]`) is **already populated on page load**. The manual flow is:
pick the trámite → click **Aceptar**. The office dropdown is never touched.

## 2. Problem

Step 0 today opens the office dropdown and re-selects "Cualquier oficina"
(`select('#sede', { value: '99' })`) before selecting the trámite. This is:

- **An anti-detection liability.** The project's whole purpose is to behave like
  a human; opening a dropdown a real user wouldn't touch is a behavioural
  mismatch a WAF can fingerprint.
- **A functional no-op anyway.** Re-selecting the value that is already selected
  does not fire the dropdown's `change` event, so `cargaTramites()` does not
  re-run. The step only works because the trámite options are already present on
  load — confirmed against the live page (user-verified: the trámites are listed
  without touching the office).

The original design (`2026-06-19` spec §4/§11) assumed the trámite list only
populates *after* an office change, hence the deliberate office select. That
assumption is wrong for the default office.

## 3. Chosen approach — "Approach B": manual match + invisible guard

Drop the phantom office interaction. In its place, an **invisible** guard that
reads `#sede` without interacting and only corrects it in the abnormal case.

Considered and rejected:
- **A — pure manual match** (just delete the select): simplest, but if the page
  ever loads with a different office defaulted, the bot would silently watch only
  that office. No signal to the user.
- **C — keep select, skip-if-99**: behaviourally identical to A, more code.

B keeps the normal case human-identical (no office interaction) while protecting
against the one silent-failure mode A has, for ~5 lines.

## 4. Changes

### 4.1 `src/steps/00-selectRegion.ts` — actions pipeline

**Before**
```
moveRandom()
select('#sede', { value: '99' })            // delete
waitForTramiteOptions
select('#tramiteGrupo[0]', { label })
move('#btnAceptar') + click('#btnAceptar')
```

**After**
```
moveRandom()
ensureAnyOffice                              // new (§4.2)
waitForTramiteOptions                        // unchanged
select('#tramiteGrupo[0]', { label })
move('#btnAceptar') + click('#btnAceptar')
```

`ANY_OFFICE_VALUE` (`'99'`) and `TRAMITE_SELECT` (`#tramiteGrupo\[0\]`) constants
are unchanged.

### 4.2 `ensureAnyOffice` action

A labeled custom action (`label(...)`) inserted where the office select was:

- Read the current value invisibly: `const current = await page.locator('#sede').inputValue()`.
  No click, no event dispatched — the WAF sees nothing.
- **Normal case** (`current === ANY_OFFICE_VALUE`): do nothing. The next control
  the bot touches is the trámite dropdown — exactly the manual flow.
- **Abnormal case** (`current !== ANY_OFFICE_VALUE`): `console.warn` the
  unexpected default, then do a real human interaction —
  `await cursor.click('#sede')` then `await page.selectOption('#sede', { value: ANY_OFFICE_VALUE })`.
  This fires `cargaTramites()`; `waitForTramiteOptions` (next action) then waits
  for the trámite list to repopulate, as it did originally.

`#sede` is guaranteed present: the step's `before` already
`waitForSelector('#sede')` before any action runs, so `inputValue()` cannot race
a missing element.

### 4.3 `waitForTramiteOptions` — unchanged

Kept as-is. Normal case: resolves instantly (trámites pre-rendered). Abnormal
case: does its original job of waiting out `cargaTramites()`. A free safety net
in both branches.

### 4.4 Mock fidelity — `mock-server/pages/bcn_combined.html`

The mock was built from the wrong assumption (`#sede` defaults to empty,
`#tramiteGrupo[0]` empty until `cargaTramites()` fires). Correct it to model the
real page so `npm run mock:bot` exercises the real happy path:

- `#sede`: `<option value="99" selected>Cualquier oficina</option>` — default is `99`.
- `#tramiteGrupo[0]`: pre-render the toma-de-huellas `<option>` in the HTML so it
  exists on load without an office change.
- Keep `cargaTramites()` and the `onchange` wired so the abnormal/corrective
  branch (§4.2) remains exercisable, but it is no longer required for the happy
  path.

With this, the mock happy path: read `#sede=99` → skip office → select
pre-populated trámite → click Aceptar → advance to entrar. The office dropdown is
never touched.

## 5. Out of scope

- Other steps (entrar, NIE, confirm, citaSelect) — unchanged.
- Runner, config schema, notifications — unchanged.
- No new config flags.

## 6. Testing

- `tsc` clean build.
- `npm run mock:bot` → step 0 logs show **no** `select(#sede…)` / office
  interaction; trámite is selected; Aceptar clicked; flow advances to entrar.
- `npm test` stays green (existing watcher integration/flow test unaffected by
  this change).

## 7. Doc hygiene

Update `2026-06-19-citabot-barcelona-notify-design.md`:
- §4, step 0 row: replace "`select('#sede', { value: '99' })` to fire
  `cargaTramites()`" with the invisible-guard behaviour (§4.2 here).
- §11, `cargaTramites()` timing risk: note the trámite list is present on load for
  the default office; the office is only touched in the abnormal-default branch.
