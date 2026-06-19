# CitaBot → Barcelona toma-de-huellas watcher

**Date:** 2026-06-19
**Status:** Approved design (pre-implementation)

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

| # | StepId | Page | Actions |
|---|--------|------|---------|
| 0 | OpenAndSelect | entry | navigate to `entryPath`; dismiss cookie banner if present; leave `#sede` = "Cualquier oficina"; `select('#tramiteGrupo[0]', { label: tramiteLabel })`; click `#btnAceptar` |
| 1 | Entrar | acInfo | wait `#btnEntrar`; click (unchanged) |
| 2 | PersonalId | NIE | type `#txtIdCitado` = nie; type `#txtDesCitado` = nombre; `select('#txtPaisNac', { label: nacionalidad })`; click `#btnEnviar` |
| 3 | SolicitarCita | confirm | wait `#btnEnviar`; click (unchanged selector) |
| 4 | CitaCheck | result | by-negation: see §5 |

`BotWalker` runs steps in order. **CitaCheck returning a success string flows into the
runner's existing `notifyCitaFound` + `waitForEnter` (stop, browser stays open).** No
change to the runner happy path.

Deleted steps: `01-tramite`, `05-office`, `06-personalContact`. Merged: office+tramite
into step 0. `matchOffice` (`src/lib/office.ts`) becomes unused by the pipeline (file kept).

## 5. CitaCheck logic (the watcher core)

After SolicitarCita submits, on the resulting page:

1. If body contains `En este momento no hay citas disponibles` → `throw RestartFromBeginning('No citas')` → runner sleeps randomized `pollDelaySeconds` and retries from step 0.
2. Else if the page is the Imperva reject (`Request Rejected` / support ID, or path `/acInfo` with no flow content) → throw a back-off error (longer sleep), treated like bot-detection.
3. Else (we are past "Solicitar Cita" and not on the no-citas page) → **return success** (`"Cita(s) available in Barcelona — book manually."`). Runner notifies + stops.

No slot/date parsing. `minCitaDate` is not consulted (per "any cita" decision).

## 6. Config schema changes (`src/config.ts` + `config.json`)

Add:

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

Kept but unused by the watcher: `location`, `offices`, `minCitaDate`, `personalData.telefono`,
`personalData.email` (retained for reference / possible future auto-book). `homeassistant`
notifications remain supported and optional.

## 7. Notifications (`src/notifications.ts` + `src/notifications/telegram.ts`)

New `sendTelegram(cfg, { title, message })`:
`POST https://api.telegram.org/bot<botToken>/sendMessage` with body `{ chat_id, text }`
(text = `title` + newline + `message`). Fail-soft (log on error, never throw).

Wire into `notifyCitaFound` (primary) and `notifyFailure` (secondary). Existing
`callHomeAssistant` path unchanged; both fire if configured. Terminal `console.log`
remains as the always-on fallback.

## 8. Runner changes (`src/bot/runner.ts`)

- `handleError(RestartFromBeginning)` returns `sleepMs` drawn randomly from `pollDelaySeconds`
  (was hard-coded 5000).
- Add WAF/back-off branch: the back-off error from CitaCheck §5.2 maps to a longer sleep
  (e.g. 5–10 min) and clears cookies, reusing existing bot-detection plumbing.
- Happy path (`notifyCitaFound` + `waitForEnter`) is unchanged.

## 9. Mock server (`mock-server/`)

Update mock pages to the Barcelona DOM so `npm run mock:bot` exercises the new flow
offline:

- combined office+tramite page (`#sede` with "Cualquier oficina", `#tramiteGrupo[0]` with the toma-de-huellas option, `#btnAceptar`),
- entrar (`#btnEntrar`),
- NIE (`#txtIdCitado`, `#txtDesCitado`, `#txtPaisNac`, `#btnEnviar`),
- confirm (`#btnEnviar` "Solicitar Cita"),
- a "no citas" page (`#mensajeInfo` text) and a "citas available" page,
- `MOCK_NO_CITA=1` toggles between the last two.

## 10. Testing

1. `tsc` clean build.
2. `npm run mock:bot` with `MOCK_NO_CITA=1` → confirm the no-citas loop + randomized backoff.
3. Mock without the flag → confirm CitaCheck returns success → `notifyCitaFound` fires → bot stops.
4. Standalone Telegram send test using the user's real token + chat ID (entered by the user).
5. Existing `matchOffice` unit test stays green (even though unused in pipeline).
6. Manual: one careful real-site dry run (user drives NIE entry) to confirm selectors against `/icpplustieb/`.

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

## 12. Non-goals

- Auto-booking, captcha solving, slot/date selection.
- Supporting provinces other than Barcelona, or the original Alicante flow.
- Proxy/actor tuning (existing machinery left as-is; no-ops without proxies).
