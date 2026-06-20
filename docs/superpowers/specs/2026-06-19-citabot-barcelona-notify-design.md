# CitaBot → Barcelona toma-de-huellas watcher

**Date:** 2026-06-19
**Status:** Revised per plan review (pre-implementation) — Must-Fix items from review folded in

## 1. Goal

Adapt this CitaBot fork (currently built for Alicante's `/icpco/` flow) into a
**watcher** for the Barcelona `/icpplustieb/` "cita previa extranjería" flow that:

- repeatedly walks the flow up to the cita-availability check,
- **stops and notifies the user (Telegram) the moment any cita is available**,
- does **not** auto-book — the user completes the booking manually.

This is "Approach A": adapt the step pipeline in place for Barcelona. The original
Alicante flow is intentionally dropped (this is a single-province fork).

## 2. Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Structure | Approach A — rewrite steps in place for Barcelona |
| Notification channel | **Telegram push** (bot token + chat ID supplied by user, never hardcoded) |
| Alert condition | **Any cita** appears (by-negation: absence of the "no hay citas" message). No date parsing. |
| Office strategy | **"Cualquier oficina"** (any Barcelona office). Priority list kept in config but unused by watcher. |
| Booking | Notify-and-stop, **no auto-book** (existing runner behavior) |
| Poll cadence | Randomized `pollDelaySeconds` (default `[45, 90]`) instead of hard 5s, to reduce NIE shadow-ban risk |
| WAF rejection | Detect Imperva "Request Rejected" page → back-off, not crash |

## 3. Barcelona flow as mapped (reference)

Entry: `https://icp.administracionelectronica.gob.es/icpplustieb/citar?p=8&locale=es`

| Page | Key elements |
|------|--------------|
| Combined office + tramite | office `<select id="sede">` (onchange `cargaTramites()`); "Cualquier oficina" = value `99`. Police tramites `<select id="tramiteGrupo[0]">`; Regularización = `tramiteGrupo[1]`. Submit `<input id="btnAceptar" type="button" onclick="envia()">`. Cookie banner "Acepto" present. |
| Instructions (`acInfo`) | `<div id="btnEntrar" onclick="document.forms[0].submit()">` ("Presentación sin Cl@ve") |
| Personal ID | NIE `<input id="txtIdCitado" maxlength="9">`; name `<input id="txtDesCitado" onchange="comprobarDatos()">`; nationality `<select id="txtPaisNac" required>` (ECUADOR = value `222`); submit `<input id="btnEnviar" type="button" onclick="envia()">` |
| Confirm | `<input id="btnEnviar" type="button" value="Solicitar Cita" onclick="enviar('solicitud')">` |
| No citas | `<div id="mensajeInfo">` containing `En este momento no hay citas disponibles`; `<input id="btnSubmit" value="Aceptar" onclick="enviar()">` (form posts `salirInicio`) |
| WAF reject | path `/icpplustieb/acInfo`, body "The requested URL was rejected" + support ID |

Exact tramite label (92 chars, verified char-for-char against the live option):
`POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013`

The contact (phone/email) page is **not** part of this path — it appears only after a
slot is chosen during manual booking. Hence the watcher never reaches it.

## 4. New pipeline (5 steps, replacing the current 8)

| # | File / StepId | Page | Actions |
|---|---------------|------|---------|
| 0 | `00-selectRegion.ts` / `StepId.RegionSelect` | entry | navigate to `config.entryPath`; dismiss cookie banner if present; **invisible-guard the office** — read `#sede` via `inputValue()` (no interaction) and only `select('#sede', { value: '99' })` ("Cualquier oficina") if it is *not* already `99`; **wait for the `#tramiteGrupo\[0\]` toma-de-huellas option to be attached**; `select('#tramiteGrupo\\[0\\]', { label: config.tramiteLabel })`; `move`+`click` `#btnAceptar`. See `2026-06-20-step0-office-select-design.md`. |
| 1 | `02-entrar.ts` / `StepId.Entrar` | acInfo | wait `#btnEntrar`; `move`+`click` (unchanged) |
| 2 | `03-personalId.ts` / `StepId.PersonalId` | NIE | `click`+`type` `#txtIdCitado` = nie; `type` `#txtDesCitado` = nombre; `select('#txtPaisNac', { label: config.personalData.nacionalidad })`; `move`+`click` `#btnEnviar` |
| 3 | `04-personalIdConfirm.ts` / `StepId.PersonalIdConfirm` | confirm | wait `#btnEnviar`; `move`+`click` (unchanged selector) |
| 4 | `07-citaSelect.ts` / `StepId.CitaSelect` | result | bounded race, see §5 |

> **Selector escaping:** the bracketed ids are literal (form-array notation), not CSS attribute
> selectors. They **must** be escaped (`#tramiteGrupo\\[0\\]`) or written as
> `[id="tramiteGrupo[0]"]` — matching the existing `01-tramite.ts` (`#tramiteGrupo\\[1\\]`).
> `#tramiteGrupo[0]` unescaped parses as "id=tramiteGrupo with attribute `[0]`" and will not match.

**StepId reuse — do not invent new enum members.** The runner is coupled to specific `StepId`
values: `runner.ts` references `StepId.RegionSelect` (initial `stepRef`, l.177), `StepId.Tramite`
(tramite-block proxy rotation l.279/288/309 + the actor-probe call l.379), and `StepId.CitaSelect`
(`keepBrowserOpenOnFailure` recovery, l.325). The 5 watcher steps therefore **reuse existing
enum members** (`RegionSelect`, `Entrar`, `PersonalId`, `PersonalIdConfirm`, `CitaSelect`) so the
runner keeps compiling and its recovery branches keep firing. `StepId.Tramite`, `StepId.Office`,
`StepId.PersonalContact` stay in the enum (still referenced / now unused) — **do not delete them**;
the tramite-block special-casing simply never matches in the watcher (a harmless no-op, not a break).

`BotWalker` runs steps in order. **The final step (`StepId.CitaSelect`, the reused
`07-citaSelect.ts`) returning a success string flows into the runner's existing `notifyCitaFound`
+ `waitForEnter` (stop, browser stays open).** No change to the runner happy path.

Dropped from `defaultSteps` in `src/steps/index.ts` (files kept on disk): `01-tramite.ts`
(merged into step 0), `05-office.ts` (any-office), `06-personalContact.ts` (page not reached).
`matchOffice` (`src/lib/office.ts`) and the date parsers (`src/lib/parsers.ts`) become unused by
the pipeline (files + unit tests kept green). Reusing `07-citaSelect.ts` means rewriting its
`before`/`after` (§5); the numbered-step convention and `src/steps/index.ts` registration are
preserved (non-contiguous numbering `00,02,03,04,07` is acceptable — renumbering is optional/cosmetic).

## 5. CitaCheck logic (the watcher core)

The check lives in the rewritten `before` hook of the reused `07-citaSelect.ts`, mirroring the
existing `Promise.race` there. **It must wait for the page to settle and race three explicit
outcomes against a bounded timeout — never conclude success by pure absence-of-negative on an
unsettled page.** Bare negation makes a false "cita found" representable (the page is still
loading → bot reports success and stops → the watch ends while slots were never there).

After the confirm submit (step 3), wait for the navigation/response, then race (cap at
`SELECTOR_TIMEOUT_MS`):

1. **No citas** — `getByText('En este momento no hay citas disponibles')` visible →
   `throw new RestartFromBeginning('No citas')` → runner sleeps randomized `pollDelaySeconds`
   and retries from step 0.
2. **WAF reject** — `getByText('The requested URL was rejected')` visible (the existing
   `wait.ts` signal — detect by text, **not** by `/acInfo` path) → `throw new WafBackoffError()`
   (new class, §8) → runner applies the long back-off + cookie clear.
3. **Cita available (positive anchor)** — a known positive element of the result/slot page is
   visible (slot container / result-form `#btnSubmit` / a slot radio) → **return**
   `"Cita(s) available in Barcelona — book manually."`. Runner notifies + stops.

If none resolves before the timeout → `throw new RetryError(…)` (transient), **not** success.
**The positive anchor is unverified — the live result page was never reached (WAF blocked
mapping), so it is the one selector the real-site dry run (§10.8) must confirm before the watcher
is trusted.** Until confirmed, gate success on "no-citas absent **AND** a known result-page
element present", never bare negation.

No slot/date parsing. `minCitaDate` is not consulted (per "any cita" decision).

## 6. Config schema changes (`src/config.ts` + `config.json`)

Add to `config.json`:

```jsonc
{
  "entryPath": "/icpplustieb/citar?p=8&locale=es",   // Barcelona entry (baseUrl still overrides host for mock)
  "personalData": { "nacionalidad": "ECUADOR" },      // new; matched as exact <option> label on #txtPaisNac
  "pollDelaySeconds": [45, 90],                        // randomized backoff between poll cycles
  "notifications": {
    "telegram": { "botToken": "<user>", "chatId": "<user>" }
  }
}
```

Matching `AppConfig` (`src/config.ts`) changes — keep types explicit so `tsc --strict` covers them:

- `entryPath?: string` — default `'/icpco/citar'` retained as fallback (existing behavior when
  unset). `00-selectRegion.ts` reads `config.entryPath` **instead of** the hard-coded
  `REGION_SELECT_PATH` constant.
- `pollDelaySeconds?: [number, number]` (tuple). Runner falls back to the current `5000` ms when
  absent (§8).
- `PersonalDataConfig.nacionalidad?: string`; make `telefono?` / `email?` **optional** (now unused
  by the watcher) so a watcher-only `config.json` type-checks.
- `notifications.telegram?: { botToken: string; chatId: string }`; extend the `citaFoundChannels`
  union to `('email' | 'homeassistant' | 'telegram')[]`. Telegram fires whenever
  `notifications.telegram` is present (independent of the channel list, matching how
  `homeassistant` works today).

Also add a `telegram` placeholder (no real values) to `config.example.json` and document it in
the README. `config.json` is already git-ignored, so the user's real token / NIE / PII stay local.

Kept but unused by the watcher: `location`, `offices`, `minCitaDate`, `personalData.telefono`,
`personalData.email` (retained for reference / possible future auto-book). `homeassistant`
notifications remain supported and optional.

## 7. Notifications (`src/notifications.ts` + `src/notifications/telegram.ts`)

New `sendTelegram(cfg, { title, message })`:
`POST https://api.telegram.org/bot<botToken>/sendMessage` with body `{ chat_id, text }`
(text = `title` + newline + `message`). Fail-soft (log on error, never throw). **The bot token is
embedded in the URL — on error log only `res.status` / a generic message, never the URL or the
request object, so the token can't leak into logs or `network-recorder` dumps.** Use the existing
`axios` dependency (already in `package.json`) or `fetch`.

Wire into `notifyCitaFound` (primary) and `notifyFailure` (secondary). Existing
`callHomeAssistant` path unchanged; both fire if configured. Terminal `console.log`
remains as the always-on fallback.

## 8. Runner changes (`src/bot/runner.ts`)

- `handleError(RestartFromBeginning)` returns `restartPreservingPage: true` + `sleepMs` drawn
  randomly from `config.pollDelaySeconds` via the existing `rand()` helper, **falling back to
  `5000` when unset** (was hard-coded `5000`).
- Add a dedicated `WafBackoffError` class in `src/bot/errors.ts` and a `handleError` branch for it:
  long `sleepMs` (e.g. 5–10 min) + `clearCookies: true`. **Do not route WAF through the existing
  `BotDetectedError` path** — that rotates actors/proxies and sleeps only 10 s, the wrong shape for
  a WAF cool-down. (The generic `wait.ts` race still maps the WAF text to `BotDetectedError` during
  in-flow waits; that stays as-is.)
- StepId reuse (§4) means no other `handleError` / `applyRecovery` change is needed — the
  `StepId.CitaSelect` recovery branch and the `StepId.Tramite` references keep their current meaning.
- Happy path (`notifyCitaFound` + `waitForEnter`) is unchanged.

## 9. Mock server (`mock-server/`)

Update the mock server (`src/mock-server/index.ts` **+** `mock-server/pages/*.html`) to the
Barcelona flow so `npm run mock:bot` exercises it offline. This is **not pages-only** — the routing
and step machinery are `/icpco/`-specific today and must change too:

- **Routing** (`src/mock-server/index.ts`): serve the entry at `/icpplustieb/citar` (matching
  `config.entryPath`); update the POST endpoints (`salirInicio`, etc.) and the `getPageForStep` map
  from 7 steps (0–6) to the 5-step watcher flow; keep the session / `advanceStep` logic in sync.
- **`package.json`**: update the `mock:bot` script's `start-server-and-test` wait URL from
  `http://localhost:3999/icpco/citar` to the new `/icpplustieb/citar` entry.
- **Pages**: combined office+tramite (`#sede` "Cualquier oficina", `#tramiteGrupo[0]` with the
  toma-de-huellas option **+ a small script that populates it on `#sede` change** to mirror
  `cargaTramites()`, `#btnAceptar`), entrar (`#btnEntrar`), NIE (`#txtIdCitado`, `#txtDesCitado`,
  `#txtPaisNac`, `#btnEnviar`), confirm (`#btnEnviar` "Solicitar Cita"), a "no citas" page
  (`#mensajeInfo` text) and a "citas available" page **exposing the §5.3 positive anchor**.
- `MOCK_NO_CITA=1` toggles between the last two.

## 10. Testing

Follow TDD for the pure-logic / parser-level changes (write the failing test first; tests run on
compiled output: `tsc` → `node --test "dist/tests/**/*.test.js"`):

1. **Unit (new, test-first):** CitaCheck classification over fixture HTML — "no citas" page →
   `RestartFromBeginning`; WAF reject page → `WafBackoffError`; "citas available" page (positive
   anchor) → success string. Factor the page-state decision into a pure helper (e.g.
   `classifyCitaResult` in `src/lib/parsers.ts`, where DOM/extraction belongs) so it is testable
   without a live page; the step's `before` calls it.
2. **Unit (new, test-first):** `sendTelegram` builds the correct URL/body, never throws on a failed
   request, and **never logs the token** (assert the error path logs status only).
3. **Fixtures:** add Barcelona `tests/fixtures/*.html` for the no-citas / WAF / citas-available
   pages used above; **update `src/tests/integration/flow.test.ts`** (currently asserts Alicante DOM
   — `#idSede`, `#cita_*`, `#chkTotal`, phone/email) to cover the watcher's actual path, or drop the
   now-irrelevant cases.
4. `tsc` clean build; `npm test` green.
5. `npm run mock:bot` with `MOCK_NO_CITA=1` → confirm the no-citas loop + randomized backoff;
   without the flag → CitaCheck returns success → `notifyCitaFound` fires → bot stops.
6. `matchOffice` and date-parser unit tests stay green (kept though unused by the pipeline).
7. Standalone Telegram send test using the user's real token + chat ID (entered by the user).
8. Manual: one careful real-site dry run (user drives NIE entry) to confirm selectors against
   `/icpplustieb/` — **in particular the §5.3 positive cita anchor and the `data-live-search`
   `#sede` / `#txtPaisNac` behavior.**

## 11. Risks / open items

- **`data-live-search` widgets** (`#sede`, `#txtPaisNac`): Playwright `selectOption` drives the
  underlying `<select>`; if the styled widget doesn't sync, may need to dispatch input/change
  or click the widget. Verify in test.
- **WAF**: Imperva rejected programmatic clicks during mapping. The bot relies on patchright +
  human-like behavior to pass; without proxies, repeated rejects mean longer backoff. Detection
  in §5.2 keeps it from crash-looping.
- **Shadow-ban**: each poll re-submits the NIE. Randomized `pollDelaySeconds` mitigates; user can
  raise it. Document the 24–74h ban risk in README.
- **Cookie banner selector** on `/icpplustieb/` may differ from the old `#cookie_action_close_header`;
  resolve during implementation (generic "Acepto" dismissal).
- **`cargaTramites()` timing**: for the **default** office the trámite list is already present on
  page load (user-verified live), so step 0 does **not** touch `#sede` in the normal case — it only
  selects "Cualquier oficina" in the abnormal-default branch, which re-fires `cargaTramites()` and is
  then covered by the wait-for-option. See `2026-06-20-step0-office-select-design.md`.
- **Positive cita anchor unknown**: the result page was never reached during mapping; the dry run
  must pin down the §5.3 positive selector, else fall back to "no-citas absent AND a known result
  element present" rather than bare negation.
- **Token in logs**: the Telegram token sits in the request URL; ensure error logging /
  `network-recorder` never capture it (§7).
- **Poll observability**: each `RestartFromBeginning` poll is **not** recorded by
  `stats.recordRun` (only success / detection / noSuitableCita are). Acceptable, but poll cycles
  won't show in stats — add a counter later if visibility is wanted.

## 12. Non-goals

- Auto-booking, captcha solving, slot/date selection.
- Supporting provinces other than Barcelona, or the original Alicante flow.
- Proxy/actor tuning (existing machinery left as-is; no-ops without proxies).
