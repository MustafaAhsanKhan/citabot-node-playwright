# CitaBot → Barcelona toma-de-huellas watcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt this Alicante CitaBot fork into a Barcelona `/icpplustieb/` "toma de huellas" **watcher** that walks the flow, stops and pushes a Telegram alert the moment any cita appears, and never auto-books.

**Architecture:** Approach A — rewrite the step pipeline in place. The 8-step Alicante flow becomes a 5-step watcher that reuses existing `StepId` enum members (so the runner keeps compiling and its recovery branches keep firing). The cita check is a settle-race + a pure `classifyCitaResult` helper. New `WafBackoffError` gives WAF rejections a long cool-down distinct from bot-detection. A fail-soft `sendTelegram` notification is wired into the existing notify functions. The mock server is rebuilt to the Barcelona flow for offline testing.

**Tech Stack:** TypeScript (CommonJS, `tsc --strict`), Patchright (Playwright fork), `node --test` on compiled JS, `axios`/`fetch`, `http` mock server.

## Global Constraints

Copied verbatim from the spec — every task implicitly includes these:

- **Tests run on compiled output:** `tsc` → `node --test "dist/tests/**/*.test.js"`. Test sources live under `src/tests/`; fixtures live under `tests/fixtures/` (project root) and are read via `path.join(process.cwd(), 'tests', 'fixtures')`.
- **`tsc --strict` must stay clean** — keep all new types explicit.
- **StepId reuse — do not invent new enum members.** The 5 watcher steps reuse `RegionSelect`, `Entrar`, `PersonalId`, `PersonalIdConfirm`, `CitaSelect`. Leave `Tramite`, `Office`, `PersonalContact` in the enum (still referenced by the runner / now unused) — do NOT delete them.
- **Dropped files stay on disk:** `01-tramite.ts`, `05-office.ts`, `06-personalContact.ts`, `src/lib/office.ts`, the date parsers in `src/lib/parsers.ts` — kept and kept green by their unit tests, just unregistered from `defaultSteps` / unused by the pipeline.
- **Selector escaping:** bracketed ids are literal form-array notation, not CSS attribute selectors. Escape them — `'#tramiteGrupo\\[0\\]'` — or write `'[id="tramiteGrupo[0]"]'`. Unescaped `#tramiteGrupo[0]` parses as "id=tramiteGrupo with attribute `[0]`" and will not match. (Matches existing `01-tramite.ts` which uses `'#tramiteGrupo\\[1\\]'`.)
- **Exact tramite label (92 chars, verified char-for-char):** `POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013`
- **Never log the Telegram bot token.** It sits in the request URL; on error log `res.status` / a generic message only — never the URL or request object (so it can't leak into logs or `network-recorder` dumps).
- **Success is never bare negation.** Gate "cita available" on "no-citas message ABSENT **and** a known result-page element PRESENT", and only after the page has settled.
- **No date/slot parsing.** `minCitaDate` is not consulted by the watcher (kept in config for reference).
- **Secrets stay local.** `config.json` is git-ignored; real token / NIE / PII never go into committed files. Only placeholders go into `config.example.json`.

---

## File Structure

| File | Responsibility | Phase |
|------|----------------|-------|
| `src/config.ts` | `AppConfig`/`PersonalDataConfig` types: add `entryPath`, `pollDelaySeconds`, `personalData.nacionalidad`; make `telefono`/`email` optional; add `notifications.telegram` + extend `citaFoundChannels` union. | P1 |
| `src/notifications/telegram.ts` *(new)* | `buildTelegramUrl`, `buildTelegramBody`, fail-soft `sendTelegram`. Pure builders + injectable `fetch`/`logger` for testing. | P1 |
| `src/notifications.ts` | Wire `sendTelegram` into `notifyCitaFound` + `notifyFailure`. | P1 |
| `src/steps/06-personalContact.ts` | Guard now-optional `telefono`/`email` so `tsc` stays green (file unregistered but still compiled). | P1 |
| `config.example.json`, `README.md` | Telegram/entryPath/pollDelaySeconds placeholders + docs. | P1 / P5 |
| `src/bot/errors.ts` | Add `WafBackoffError`. | P2 |
| `src/bot/backoff.ts` *(new)* | `pollSleepMs(config)`, `wafBackoffMs()` — pure, no Patchright import, unit-testable. | P2 |
| `src/bot/runner.ts` | `RestartFromBeginning` uses `pollSleepMs`; new `WafBackoffError` branch (long cool-down + clear cookies). | P2 |
| `src/lib/parsers.ts` | Add `classifyCitaResult` + `CITA_POSITIVE_TOKEN`/`CITA_POSITIVE_SELECTOR`. Existing date parsers untouched. | P3 |
| `src/steps/07-citaSelect.ts` | Rewrite `before`/`after`: settle-race three outcomes, classify, throw/return. | P3 |
| `src/steps/00-selectRegion.ts` | Rewrite: `entryPath`, `#sede`=99, wait for `#tramiteGrupo[0]` populate, select tramite, generic "Acepto" cookie dismissal. | P4 |
| `src/steps/03-personalId.ts` | Rewrite: `#txtDesCitado` name field + `#txtPaisNac` nationality select. | P4 |
| `src/steps/index.ts` | `defaultSteps` → 5 watcher steps. | P4 |
| `src/tests/unit/*.test.ts` *(new)* | `telegram.test.ts`, `errors.test.ts`, `backoff.test.ts`, `citaResult.test.ts`. | P1–P3 |
| `src/tests/integration/flow.test.ts` | Rewrite for the watcher path (combined-page populate + classify-over-content). | P4 |
| `tests/fixtures/bcn_*.html` *(new)* | `bcn_no_citas`, `bcn_waf`, `bcn_citas_available`, `bcn_combined`. | P3 / P4 |
| `src/mock-server/index.ts`, `mock-server/pages/bcn_*.html` | Rebuild routing + pages to the 5-step Barcelona flow. | P5 |
| `package.json` | `mock:bot` wait URL → `/icpplustieb/citar`. | P5 |

---

## Cross-Phase Dependency Order

```
P1 (config + telegram) ─► P2 (backoff + WafBackoffError + runner)
                                   │
                                   ▼
                          P3 (classifyCitaResult + 07 rewrite)
                                   │
       P1 ──────────────────────► P4 (steps 00/03 + index + integration test)
                                   │
                                   ▼
                          P5 (mock server + scripts + docs + final verify)
```

| Phase | Depends on | Why |
|-------|-----------|-----|
| **P1** | — | Foundation: config types + the Telegram channel. |
| **P2** | P1 | `backoff.ts` reads `AppConfig.pollDelaySeconds`. |
| **P3** | P2 | `07-citaSelect.ts` throws `WafBackoffError`. |
| **P4** | P1, P3 | Steps 00/03 read `entryPath`/`nacionalidad` (P1); `index.ts` imports the rewritten `citaSelectStep` and the integration test imports `classifyCitaResult` (P3). |
| **P5** | P4 | The mock serves the 5-step flow that must match the rewritten steps. |

Each phase ends with **`tsc` clean + `npm test` green + a commit**, so you can stop after any phase and resume cold.

---

## OPEN QUESTIONS (flagged from the spec — do not block on them; use the documented defaults)

1. **Positive cita anchor is UNVERIFIED (spec §5.3 / §11).** The Barcelona result/slot page was never reached during mapping (WAF blocked it). This plan uses `input[name="rdbCita"]` (a slot radio, mirroring the Alicante result page) as the placeholder anchor, defined once as `CITA_POSITIVE_TOKEN` in `parsers.ts`. **The real-site dry run (Phase 5, manual §10.8) must confirm it.** Until confirmed, success stays gated on "no-citas absent AND this anchor present".
2. **Cookie-banner selector on `/icpplustieb/` (spec §11).** The old `#cookie_action_close_header` may not exist. This plan uses a generic `getByText('Acepto', { exact: true })` dismissal. Confirm/adjust in the dry run.
3. **`data-live-search` widgets (`#sede`, `#txtPaisNac`) (spec §11).** `selectOption` drives the underlying `<select>`; if the styled widget doesn't sync on the live site, the dry run may reveal a need to click the widget / dispatch input events. Out of scope for the mock (plain `<select>`s).

---

## Phase 1 — Config schema + Telegram notifications

**Prerequisites / cold-start state:** Fresh clone on branch `improvements`. No phases done yet. `npm install` already run (deps present in `package.json`). `npm test` is green against the current Alicante code. You are adding types + a new notification channel; no browser code changes.

**Why first:** Pure, no-browser, fully unit-testable. Every later phase reads the config types added here.

**Task independence:** 1.1 must come first (types). 1.2 → 1.3 are sequential (1.3 calls 1.2's function). 1.4 (docs) is independent of 1.2/1.3 and may be done in parallel with them once 1.1 lands.

### Task 1.1: Extend config types + guard the now-optional contact fields

**Files:**
- Modify: `src/config.ts:4-9` (`PersonalDataConfig`) and `src/config.ts:39-62` (`AppConfig`)
- Modify: `src/steps/06-personalContact.ts:8-22`

There is no unit test for the type change itself — its gate is `tsc` clean. Making `telefono`/`email` optional breaks `06-personalContact.ts` (the only consumer, verified by grep), so that file is fixed in the same task to keep the build green.

- [ ] **Step 1: Edit `PersonalDataConfig` in `src/config.ts`**

Replace lines 4-9:

```ts
export interface PersonalDataConfig {
    nie: string;
    nombre: string;
    /** Optional: exact <option> label on #txtPaisNac (e.g. "ECUADOR"). Used by the Barcelona watcher. */
    nacionalidad?: string;
    /** Optional — unused by the watcher (kept for possible future auto-book). */
    telefono?: string;
    /** Optional — unused by the watcher (kept for possible future auto-book). */
    email?: string;
}
```

- [ ] **Step 2: Add `entryPath` + `pollDelaySeconds` to `AppConfig`**

In `src/config.ts`, find the block (lines 48-50):

```ts
    offices: string[];
    minCitaDate: string;
    personalData: PersonalDataConfig;
```

Replace with:

```ts
    offices: string[];
    minCitaDate: string;
    /** Barcelona entry path; falls back to '/icpco/citar' when unset. baseUrl still overrides the host. */
    entryPath?: string;
    /** [minSeconds, maxSeconds] randomized backoff between poll cycles. Runner falls back to 5000ms when unset. */
    pollDelaySeconds?: [number, number];
    personalData: PersonalDataConfig;
```

- [ ] **Step 3: Extend the `notifications` block in `AppConfig`**

Replace lines 56-61:

```ts
    notifications?: {
        failureCountThreshold?: number;
        citaFoundChannels?: ('email' | 'homeassistant' | 'telegram')[];
        criticalAfterSeconds?: number;
        homeassistant?: { url: string; token: string };
        telegram?: { botToken: string; chatId: string };
    };
```

- [ ] **Step 4: Guard the optional fields in `src/steps/06-personalContact.ts`**

Replace the `actions` function body (lines 8-22) so the now-optional fields type-check (file stays compiled though unregistered):

```ts
    actions: (ctx) => {
        const telefono = ctx.config.personalData.telefono ?? '';
        const email = ctx.config.personalData.email ?? '';
        return [
            moveRandom(),
            click('#txtTelefonoCitado'),
            typeChars(telefono),
            press('Tab'),
            typeChars(email),
            press('Tab'),
            typeChars(email),
            scroll('#btnSiguiente'),
            move('#btnSiguiente'),
            click('#btnSiguiente'),
        ];
    },
```

- [ ] **Step 5: Verify the build is clean**

Run: `npx tsc`
Expected: exits 0, no output.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/steps/06-personalContact.ts
git commit -m "feat(config): add entryPath, pollDelaySeconds, nacionalidad, telegram; make contact fields optional"
```

### Task 1.2: Telegram notification module (TDD)

**Files:**
- Create: `src/notifications/telegram.ts`
- Test: `src/tests/unit/telegram.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (`src/config.ts`).
- Produces: `buildTelegramUrl(botToken: string): string`, `buildTelegramBody(chatId: string, title: string, message: string): { chat_id: string; text: string }`, `sendTelegram(cfg: AppConfig, payload: { title: string; message: string }, deps?: { fetchFn?: typeof fetch; logger?: (msg: string) => void }): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/telegram.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildTelegramUrl, buildTelegramBody, sendTelegram } from '../../notifications/telegram'
import type { AppConfig } from '../../config'

const TOKEN = '123456:SECRET-TOKEN'
const cfg = { notifications: { telegram: { botToken: TOKEN, chatId: '999' } } } as AppConfig

describe('buildTelegramUrl', () => {
    it('embeds the bot token in the sendMessage path', () => {
        assert.strictEqual(
            buildTelegramUrl(TOKEN),
            'https://api.telegram.org/bot123456:SECRET-TOKEN/sendMessage'
        )
    })
})

describe('buildTelegramBody', () => {
    it('joins title and message with a newline', () => {
        assert.deepStrictEqual(buildTelegramBody('999', 'T', 'M'), { chat_id: '999', text: 'T\nM' })
    })
})

describe('sendTelegram', () => {
    it('POSTs the correct url and body when telegram is configured', async () => {
        let calledUrl = ''
        let calledBody = ''
        const fetchFn = (async (url: unknown, init: { body?: unknown }) => {
            calledUrl = String(url)
            calledBody = String(init.body)
            return { ok: true, status: 200 } as unknown as Response
        }) as unknown as typeof fetch
        await sendTelegram(cfg, { title: 'Cita', message: 'found' }, { fetchFn })
        assert.strictEqual(calledUrl, 'https://api.telegram.org/bot123456:SECRET-TOKEN/sendMessage')
        assert.deepStrictEqual(JSON.parse(calledBody), { chat_id: '999', text: 'Cita\nfound' })
    })

    it('does nothing when telegram config is absent', async () => {
        let called = false
        const fetchFn = (async () => {
            called = true
            return { ok: true, status: 200 } as unknown as Response
        }) as unknown as typeof fetch
        await sendTelegram({} as AppConfig, { title: 'x', message: 'y' }, { fetchFn })
        assert.strictEqual(called, false)
    })

    it('never throws and logs status only (no token) on a failed request', async () => {
        const logs: string[] = []
        const fetchFn = (async () => ({ ok: false, status: 500 } as unknown as Response)) as unknown as typeof fetch
        await sendTelegram(cfg, { title: 'x', message: 'y' }, { fetchFn, logger: (m) => logs.push(m) })
        assert.strictEqual(logs.length, 1)
        assert.match(logs[0], /500/)
        assert.ok(!logs[0].includes(TOKEN), 'log must not contain the bot token')
    })

    it('never throws when fetch rejects, and never logs the token', async () => {
        const logs: string[] = []
        const fetchFn = (async () => { throw new Error(`connect ${TOKEN}`) }) as unknown as typeof fetch
        await sendTelegram(cfg, { title: 'x', message: 'y' }, { fetchFn, logger: (m) => logs.push(m) })
        assert.strictEqual(logs.length, 1)
        assert.ok(!logs[0].includes(TOKEN), 'log must not contain the bot token')
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc && node --test dist/tests/unit/telegram.test.js`
Expected: FAIL — `Cannot find module '../../notifications/telegram'` (tsc error: module not found), so the build fails before tests run.

- [ ] **Step 3: Write the implementation**

Create `src/notifications/telegram.ts`:

```ts
import type { AppConfig } from '../config';

export interface TelegramDeps {
    fetchFn?: typeof fetch;
    logger?: (msg: string) => void;
}

/** Build the Telegram sendMessage URL. The bot token is embedded in the path — never log this value. */
export function buildTelegramUrl(botToken: string): string {
    return `https://api.telegram.org/bot${botToken}/sendMessage`;
}

export function buildTelegramBody(
    chatId: string,
    title: string,
    message: string
): { chat_id: string; text: string } {
    return { chat_id: chatId, text: `${title}\n${message}` };
}

/**
 * Send a Telegram push. Fail-soft: never throws. On error logs the HTTP status / a generic
 * message only — never the URL or token (so the token cannot leak into logs or network dumps).
 */
export async function sendTelegram(
    cfg: AppConfig,
    payload: { title: string; message: string },
    deps: TelegramDeps = {}
): Promise<void> {
    const tg = cfg.notifications?.telegram;
    if (!tg?.botToken || !tg?.chatId) return;
    const fetchFn = deps.fetchFn ?? fetch;
    const log = deps.logger ?? ((m: string) => console.error(m));
    try {
        const res = await fetchFn(buildTelegramUrl(tg.botToken), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildTelegramBody(tg.chatId, payload.title, payload.message)),
        });
        if (!res.ok) log(`Telegram notification failed: ${res.status}`);
    } catch {
        log('Telegram notification failed: request error');
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc && node --test dist/tests/unit/telegram.test.js`
Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/telegram.ts src/tests/unit/telegram.test.ts
git commit -m "feat(notifications): add fail-soft sendTelegram with token-safe logging"
```

### Task 1.3: Wire Telegram into the notify functions

**Files:**
- Modify: `src/notifications.ts:1` (import) and the bodies of `notifyFailure` (lines 24-28) and `notifyCitaFound` (lines 36-42)

**Interfaces:**
- Consumes: `sendTelegram` (Task 1.2).
- Produces: no signature change — `notifyCitaFound`/`notifyFailure` keep their existing signatures; they now also fire Telegram when configured.

There is no new automated test here (these functions call the real network for HomeAssistant + Telegram and aren't injectable). The gate is `tsc` clean + the Task 1.2 unit tests still green + manual §10.7 in Phase 5. Telegram fires whenever `notifications.telegram` is present (independent of `citaFoundChannels`, mirroring how HomeAssistant works).

- [ ] **Step 1: Add the import**

In `src/notifications.ts`, after line 1 (`import type { AppConfig } from './config'`):

```ts
import { sendTelegram } from './notifications/telegram'
```

- [ ] **Step 2: Fire Telegram in `notifyCitaFound`**

In `notifyCitaFound`, immediately after the existing `await callHomeAssistant(cfg, { message: msg, title: 'Cita Bot - Cita Found!' })` line (line 41), add:

```ts
    await sendTelegram(cfg, { title: 'Cita Bot - Cita Found!', message: msg })
```

- [ ] **Step 3: Fire Telegram in `notifyFailure`**

In `notifyFailure`, immediately after the existing `await callHomeAssistant(cfg, { message: msg, title: 'Cita Bot - Failure Alert' })` line (line 27), add:

```ts
    await sendTelegram(cfg, { title: 'Cita Bot - Failure Alert', message: msg })
```

- [ ] **Step 4: Verify build + tests**

Run: `npm test`
Expected: build clean; all suites pass (existing office/parsers + new telegram), `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/notifications.ts
git commit -m "feat(notifications): fire Telegram from notifyCitaFound and notifyFailure"
```

### Task 1.4: Config example + README placeholders

**Files:**
- Modify: `config.example.json` (full replacement below)
- Modify: `README.md` (config table + a short Telegram section)

No real values — `config.json` (git-ignored) holds the user's real token/NIE.

- [ ] **Step 1: Replace `config.example.json` with the watcher-shaped example**

```json
{
  "browserProfile": "test",
  "rotateProxyOnTramiteBlock": true,
  "location": "Barcelona",
  "entryPath": "/icpplustieb/citar?p=8&locale=es",
  "tramiteLabel": "POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013",
  "offices": [
    "CNP COMISARIA EXAMPLE 1",
    "CNP COMISARIA EXAMPLE 2"
  ],
  "minCitaDate": "2026-02-15",
  "pollDelaySeconds": [45, 90],
  "personalData": {
    "nie": "your_nie",
    "nombre": "your name",
    "nacionalidad": "ECUADOR",
    "telefono": "6XXXXXXXX",
    "email": "your@email.com"
  },
  "keepBrowserOpenOnFailure": true,
  "notifications": {
    "failureCountThreshold": 5,
    "criticalAfterSeconds": 60,
    "citaFoundChannels": ["telegram"],
    "telegram": {
      "botToken": "<your-bot-token>",
      "chatId": "<your-chat-id>"
    },
    "homeassistant": {
      "url": "http://homeassistant.local:8123",
      "token": "your_long_lived_token"
    }
  },
  "proxies": [
    {
      "server": "proxy1.example.com:port",
      "username": "user1",
      "password": "pass1"
    }
  ]
}
```

- [ ] **Step 2: Add config rows to the README table**

In `README.md`, in the Configuration table (after the `minCitaDate` row, ~line 45), add:

```markdown
| `entryPath` | Cita site entry path (Barcelona watcher: `/icpplustieb/citar?p=8&locale=es`). Falls back to `/icpco/citar` when unset. |
| `pollDelaySeconds` | `[min, max]` seconds; randomized backoff between poll cycles (default `5` s when unset). Raise to lower shadow-ban risk. |
| `personalData.nacionalidad` | Exact `<option>` label on the nationality select (e.g. `ECUADOR`). |
```

And update the `notifications` row to mention Telegram:

```markdown
| `notifications` | `failureCountThreshold`, `criticalAfterSeconds`, `homeassistant` url+token, `telegram` botToken+chatId |
```

- [ ] **Step 3: Add a Telegram section to the README**

In `README.md`, right after the "## Home Assistant Notifications" section, add:

```markdown
## Telegram Notifications

Set `notifications.telegram.botToken` and `notifications.telegram.chatId` to receive a push when a
cita is found (and on the failure alert). Create a bot via [@BotFather](https://t.me/BotFather) for
the token; get your chat ID from [@userinfobot](https://t.me/userinfobot). The token is embedded in
the request URL and is never written to logs or network dumps. Telegram fires whenever the block is
present, independent of `citaFoundChannels`.

> **Barcelona watcher behaviour:** this fork is a *watcher* — it walks the toma-de-huellas flow,
> stops the moment any cita is available, and pushes a Telegram alert. It does **not** auto-book; you
> complete the booking manually in the open browser. See the shadow-ban warning under Known Limitations.
```

- [ ] **Step 4: Verify (sanity — JSON parses, build unaffected)**

Run: `node -e "JSON.parse(require('fs').readFileSync('config.example.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add config.example.json README.md
git commit -m "docs: document Telegram, entryPath, pollDelaySeconds in example config and README"
```

**Phase 1 done when:** `npm test` green, `config.example.json` parses, changes committed.

---

## Phase 2 — Backoff helpers + WafBackoffError + runner wiring

**Prerequisites / cold-start state:** Phase 1 committed (`src/config.ts` has `pollDelaySeconds`). `npm test` green. `src/bot/errors.ts` still has only `RetryError`/`RestartFromBeginning`/`BotDetectedError`/`NoSuitableCitaError`. `src/bot/runner.ts` still hard-codes `5000` ms for `RestartFromBeginning` and has no WAF branch.

**Why second:** `07-citaSelect.ts` (Phase 3) throws `WafBackoffError`, which needs a runner branch; the backoff helper needs `AppConfig.pollDelaySeconds` (Phase 1).

**Task independence:** 2.1 and 2.2 are independent of each other (different files, both TDD) and may be done in parallel. 2.3 depends on both (it imports `WafBackoffError` and the backoff helpers).

### Task 2.1: `WafBackoffError` class (TDD)

**Files:**
- Modify: `src/bot/errors.ts` (append)
- Test: `src/tests/unit/errors.test.ts`

**Interfaces:**
- Produces: `class WafBackoffError extends Error` with `name === 'WafBackoffError'`, default message `'WAF rejected request'`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/errors.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { WafBackoffError } from '../../bot/errors'

describe('WafBackoffError', () => {
    it('is an Error with the WafBackoffError name and a default message', () => {
        const e = new WafBackoffError()
        assert.ok(e instanceof Error)
        assert.strictEqual(e.name, 'WafBackoffError')
        assert.strictEqual(e.message, 'WAF rejected request')
    })
    it('accepts a custom message', () => {
        assert.strictEqual(new WafBackoffError('boom').message, 'boom')
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc && node --test dist/tests/unit/errors.test.js`
Expected: FAIL — tsc error: `Module '"../../bot/errors"' has no exported member 'WafBackoffError'`.

- [ ] **Step 3: Add the class**

Append to `src/bot/errors.ts`:

```ts
export class WafBackoffError extends Error {
    constructor(message = 'WAF rejected request') {
        super(message);
        this.name = 'WafBackoffError';
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc && node --test dist/tests/unit/errors.test.js`
Expected: PASS — `# pass 2`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/bot/errors.ts src/tests/unit/errors.test.ts
git commit -m "feat(errors): add WafBackoffError for WAF cool-down"
```

### Task 2.2: Backoff helpers (TDD)

**Files:**
- Create: `src/bot/backoff.ts`
- Test: `src/tests/unit/backoff.test.ts`

**Interfaces:**
- Consumes: `rand` (`src/misc`), `AppConfig` (`src/config`).
- Produces: `pollSleepMs(config: Pick<AppConfig,'pollDelaySeconds'>, randFn?): number`, `wafBackoffMs(randFn?): number`, and constants `DEFAULT_POLL_MS = 5000`, `WAF_BACKOFF_MIN_MS`, `WAF_BACKOFF_MAX_MS`. No Patchright import (keeps the unit test light).

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/backoff.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
    pollSleepMs,
    wafBackoffMs,
    DEFAULT_POLL_MS,
    WAF_BACKOFF_MIN_MS,
    WAF_BACKOFF_MAX_MS,
} from '../../bot/backoff'
import type { AppConfig } from '../../config'

describe('pollSleepMs', () => {
    it('returns the default 5000ms when pollDelaySeconds is unset', () => {
        assert.strictEqual(pollSleepMs({} as AppConfig), DEFAULT_POLL_MS)
    })
    it('draws from [min,max] seconds and converts to ms', () => {
        const cfg = { pollDelaySeconds: [45, 90] } as AppConfig
        const stub = (min: number, max: number) => {
            assert.strictEqual(min, 45)
            assert.strictEqual(max, 90)
            return 60
        }
        assert.strictEqual(pollSleepMs(cfg, stub), 60000)
    })
    it('falls back when the tuple is malformed', () => {
        const cfg = { pollDelaySeconds: [10] as unknown as [number, number] } as AppConfig
        assert.strictEqual(pollSleepMs(cfg), DEFAULT_POLL_MS)
    })
})

describe('wafBackoffMs', () => {
    it('draws between the 5 and 10 minute bounds', () => {
        const stub = (min: number, max: number) => {
            assert.strictEqual(min, WAF_BACKOFF_MIN_MS)
            assert.strictEqual(max, WAF_BACKOFF_MAX_MS)
            return min
        }
        assert.strictEqual(wafBackoffMs(stub), WAF_BACKOFF_MIN_MS)
        assert.strictEqual(WAF_BACKOFF_MIN_MS, 5 * 60 * 1000)
        assert.strictEqual(WAF_BACKOFF_MAX_MS, 10 * 60 * 1000)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc && node --test dist/tests/unit/backoff.test.js`
Expected: FAIL — tsc error: `Cannot find module '../../bot/backoff'`.

- [ ] **Step 3: Write the implementation**

Create `src/bot/backoff.ts`:

```ts
import { rand } from '../misc';
import type { AppConfig } from '../config';

export const DEFAULT_POLL_MS = 5000;
export const WAF_BACKOFF_MIN_MS = 5 * 60 * 1000; // 5 min
export const WAF_BACKOFF_MAX_MS = 10 * 60 * 1000; // 10 min

/** Randomized poll backoff in ms from config.pollDelaySeconds (seconds), falling back to 5000ms when unset. */
export function pollSleepMs(
    config: Pick<AppConfig, 'pollDelaySeconds'>,
    randFn: (min: number, max: number) => number = rand
): number {
    const t = config.pollDelaySeconds;
    if (t && t.length === 2) return randFn(t[0], t[1]) * 1000;
    return DEFAULT_POLL_MS;
}

/** Randomized long WAF cool-down in ms (5–10 min). */
export function wafBackoffMs(randFn: (min: number, max: number) => number = rand): number {
    return randFn(WAF_BACKOFF_MIN_MS, WAF_BACKOFF_MAX_MS);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc && node --test dist/tests/unit/backoff.test.js`
Expected: PASS — `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/bot/backoff.ts src/tests/unit/backoff.test.ts
git commit -m "feat(bot): add pollSleepMs and wafBackoffMs backoff helpers"
```

### Task 2.3: Wire backoff + WAF into the runner

**Files:**
- Modify: `src/bot/runner.ts:16` (errors import), add a backoff import, and `handleError` (lines 262-265 for `RestartFromBeginning`; add a new `WafBackoffError` branch right after).

**Interfaces:**
- Consumes: `pollSleepMs`, `wafBackoffMs` (Task 2.2), `WafBackoffError` (Task 2.1).
- Produces: no public signature change. `RestartFromBeginning` now sleeps `pollSleepMs(this.config)`; `WafBackoffError` → `{ clearCookies: true, sleepMs: wafBackoffMs() }`.

`handleError` is private; its gate is `tsc` clean + the backoff/errors unit tests + the manual mock run in Phase 5. The new branch sits before the generic fallbacks so WAF never routes through the `BotDetectedError` path (which rotates actors and sleeps only 10 s — wrong shape for a WAF cool-down). The generic `wait.ts` race still maps WAF text to `BotDetectedError` during in-flow waits — that stays as-is.

- [ ] **Step 1: Update the errors import (line 16)**

Replace:

```ts
import {RetryError, BotDetectedError, NoSuitableCitaError, RestartFromBeginning} from './errors';
```

with:

```ts
import {RetryError, BotDetectedError, NoSuitableCitaError, RestartFromBeginning, WafBackoffError} from './errors';
import { pollSleepMs, wafBackoffMs } from './backoff';
```

- [ ] **Step 2: Replace the `RestartFromBeginning` branch and add the WAF branch**

In `handleError`, replace lines 263-265:

```ts
        if (e instanceof RestartFromBeginning) {
            return {restartPreservingPage: true, sleepMs: 5000};
        }
```

with:

```ts
        if (e instanceof RestartFromBeginning) {
            return {restartPreservingPage: true, sleepMs: pollSleepMs(this.config)};
        }

        if (e instanceof WafBackoffError) {
            // Long cool-down + clear cookies. NOT the BotDetectedError path (that rotates
            // actors/proxies and sleeps only 10s — the wrong shape for a WAF block).
            return {clearCookies: true, sleepMs: wafBackoffMs()};
        }
```

- [ ] **Step 3: Verify build + tests**

Run: `npm test`
Expected: build clean; all suites pass (`telegram`, `errors`, `backoff`, `office`, `parsers`), `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/bot/runner.ts
git commit -m "feat(runner): randomized poll backoff + WAF cool-down branch"
```

**Phase 2 done when:** `npm test` green, runner compiles with the new branches, changes committed.

---

## Phase 3 — CitaCheck core: `classifyCitaResult` + fixtures + `07` rewrite

**Prerequisites / cold-start state:** Phases 1–2 committed. `WafBackoffError` exists in `src/bot/errors.ts`; the runner has the WAF branch. `src/lib/parsers.ts` still has only the date parsers. `src/steps/07-citaSelect.ts` is still the Alicante slot-parsing version. `npm test` green.

**Why third:** The `07` rewrite throws `WafBackoffError` (Phase 2) and calls `classifyCitaResult` (this phase). It does not depend on the config/step changes in Phase 4 — after this phase the build and all unit tests stay green even though the full 8-step `defaultSteps` array isn't yet reduced (runtime flow is wired in Phase 4).

**Task independence:** 3.1 (fixtures) is independent and comes first (3.2's test reads them). 3.2 → 3.3 sequential (3.3 imports `classifyCitaResult`/`CITA_POSITIVE_SELECTOR`).

### Task 3.1: Barcelona result-page fixtures

**Files:**
- Create: `tests/fixtures/bcn_no_citas.html`
- Create: `tests/fixtures/bcn_waf.html`
- Create: `tests/fixtures/bcn_citas_available.html`

These three fixtures encode the three result-page states. `bcn_no_citas` deliberately also contains `#btnSubmit` (which the real result page shares per spec §3) but **no** `name="rdbCita"` — proving the classifier doesn't false-positive on the shared button.

- [ ] **Step 1: Create `tests/fixtures/bcn_no_citas.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sin citas</title></head>
<body>
<div class="mf-main--content">
    <div id="mensajeInfo">En este momento no hay citas disponibles. En breve, la Oficina pondrá a su disposición nuevas citas.</div>
    <input id="btnSubmit" type="button" value="Aceptar" onclick="document.forms[0].submit()">
</div>
</body>
</html>
```

- [ ] **Step 2: Create `tests/fixtures/bcn_waf.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Request Rejected</title></head>
<body>
<h1>The requested URL was rejected. Please consult with your administrator.</h1>
<p>Your support ID is: 1234567890123456789</p>
</body>
</html>
```

- [ ] **Step 3: Create `tests/fixtures/bcn_citas_available.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Selecciona cita</title></head>
<body>
<form action="/icpplustieb/advance" method="post">
    <fieldset>
        <legend>Citas disponibles</legend>
        <div id="cita_1"><label for="cita1"><strong>CITA 1</strong></label>
            <input type="radio" id="cita1" name="rdbCita" value="1"></div>
        <div id="cita_2"><label for="cita2"><strong>CITA 2</strong></label>
            <input type="radio" id="cita2" name="rdbCita" value="2"></div>
    </fieldset>
    <input id="btnSubmit" type="submit" value="Aceptar">
</form>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/bcn_no_citas.html tests/fixtures/bcn_waf.html tests/fixtures/bcn_citas_available.html
git commit -m "test(fixtures): add Barcelona no-citas, WAF, and citas-available pages"
```

### Task 3.2: `classifyCitaResult` + positive-anchor constants (TDD)

**Files:**
- Modify: `src/lib/parsers.ts` (append — do not touch the existing date parsers)
- Test: `src/tests/unit/citaResult.test.ts`

**Interfaces:**
- Produces: `type CitaResult = 'no-citas' | 'waf' | 'available' | 'unknown'`, `classifyCitaResult(html: string): CitaResult`, `const CITA_POSITIVE_TOKEN = 'name="rdbCita"'`, `const CITA_POSITIVE_SELECTOR = 'input[name="rdbCita"]'` (derived from the token so the live selector and the classifier string stay in sync).

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/citaResult.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as fs from 'fs'
import * as path from 'path'
import { classifyCitaResult } from '../../lib/parsers'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')
const load = (name: string) => fs.readFileSync(path.join(FIXTURES, `${name}.html`), 'utf-8')

describe('classifyCitaResult', () => {
    it('classifies the no-citas page as no-citas (even though it shares #btnSubmit)', () => {
        assert.strictEqual(classifyCitaResult(load('bcn_no_citas')), 'no-citas')
    })
    it('classifies the WAF reject page as waf', () => {
        assert.strictEqual(classifyCitaResult(load('bcn_waf')), 'waf')
    })
    it('classifies the citas-available page as available', () => {
        assert.strictEqual(classifyCitaResult(load('bcn_citas_available')), 'available')
    })
    it('prioritizes WAF over any other signal', () => {
        assert.strictEqual(
            classifyCitaResult('The requested URL was rejected ... name="rdbCita"'),
            'waf'
        )
    })
    it('treats an unsettled/blank page as unknown (never bare-negation success)', () => {
        assert.strictEqual(classifyCitaResult('<html><body>cargando...</body></html>'), 'unknown')
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc && node --test dist/tests/unit/citaResult.test.js`
Expected: FAIL — tsc error: `Module '"../../lib/parsers"' has no exported member 'classifyCitaResult'`.

- [ ] **Step 3: Append the implementation to `src/lib/parsers.ts`**

```ts
/**
 * UNVERIFIED positive cita anchor (spec §5.3 / §11). The Barcelona result/slot page was never
 * reached during mapping (WAF blocked it). The real-site dry run (spec §10.8) MUST confirm this
 * before the watcher is trusted. The CSS selector (live settle-race in 07-citaSelect) and the HTML
 * token (classifyCitaResult below) derive from one constant — change CITA_POSITIVE_TOKEN when the
 * real anchor is confirmed and both stay in sync.
 */
export const CITA_POSITIVE_TOKEN = 'name="rdbCita"'
export const CITA_POSITIVE_SELECTOR = `input[${CITA_POSITIVE_TOKEN}]`

export type CitaResult = 'no-citas' | 'waf' | 'available' | 'unknown'

/**
 * Classify a *settled* cita result page from its serialized HTML. Priority: WAF, then no-citas,
 * then a positive anchor. Success ('available') requires the no-citas message ABSENT *and* a known
 * result-page element present — never bare absence-of-negative (spec §5).
 */
export function classifyCitaResult(html: string): CitaResult {
    if (html.includes('The requested URL was rejected')) return 'waf'
    if (html.includes('En este momento no hay citas disponibles')) return 'no-citas'
    if (html.includes(CITA_POSITIVE_TOKEN)) return 'available'
    return 'unknown'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc && node --test dist/tests/unit/citaResult.test.js`
Expected: PASS — `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers.ts src/tests/unit/citaResult.test.ts
git commit -m "feat(parsers): add classifyCitaResult + positive-anchor constants"
```

### Task 3.3: Rewrite `07-citaSelect.ts` (settle-race + classify)

**Files:**
- Modify (full rewrite): `src/steps/07-citaSelect.ts`

**Interfaces:**
- Consumes: `classifyCitaResult`, `CITA_POSITIVE_SELECTOR` (Task 3.2); `RestartFromBeginning`, `RetryError`, `WafBackoffError` (Phase 2); `SELECTOR_TIMEOUT_MS` (`./wait`).
- Produces: `citaSelectStep` (same export name, same `StepId.CitaSelect`). `before` waits for the page to settle into one known state, then classifies: `waf` → throw `WafBackoffError`; `no-citas` → throw `RestartFromBeginning('No citas')`; not-`available` → throw `RetryError`. `actions` is `[]`. `after` returns the success string `'Cita(s) available in Barcelona — book manually.'`.

Design note: the settle-race purpose is to *block until the page settles* (or time out → transient `RetryError`); the decision then comes from the single pure `classifyCitaResult`, which both this step and the unit test share. This honours spec §5 ("never conclude success by pure absence-of-negative on an unsettled page") — we only classify after a known state is visible, and success additionally requires the positive anchor.

- [ ] **Step 1: Replace the entire contents of `src/steps/07-citaSelect.ts`**

```ts
import type { Step } from './types';
import { StepId } from './types';
import { RestartFromBeginning, RetryError, WafBackoffError } from '../bot/errors';
import { SELECTOR_TIMEOUT_MS } from './wait';
import { classifyCitaResult, CITA_POSITIVE_SELECTOR } from '../lib/parsers';

const CITA_FOUND_MESSAGE = 'Cita(s) available in Barcelona — book manually.';

export const citaSelectStep: Step = {
    id: StepId.CitaSelect,
    waitFor: undefined, // before waits for the result page to settle
    before: async (ctx) => {
        const page = ctx.page;
        console.log(`[${StepId.CitaSelect}] Waiting for cita result page to settle...`);
        // Each branch resolves true when its signal becomes visible, or false on timeout — it never
        // throws here. Racing means we never conclude on an unsettled page (spec §5).
        const appeared = (p: Promise<unknown>) => p.then(() => true).catch(() => false);
        const settled = await Promise.race([
            appeared(
                page
                    .getByText('En este momento no hay citas disponibles', { exact: false })
                    .waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS })
            ),
            appeared(
                page
                    .getByText('The requested URL was rejected', { exact: false })
                    .waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS })
            ),
            appeared(
                page.locator(CITA_POSITIVE_SELECTOR).waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS })
            ),
        ]);
        if (!settled) throw new RetryError('Cita result page did not settle', 5000);

        const result = classifyCitaResult(await page.content());
        console.log(`[${StepId.CitaSelect}] Result page classified as: ${result}`);
        if (result === 'waf') throw new WafBackoffError('WAF rejected request at cita check');
        if (result === 'no-citas') throw new RestartFromBeginning('No citas');
        if (result !== 'available') throw new RetryError('Cita result page in unknown state', 5000);
        // 'available' → fall through; `after` returns the success string.
    },
    actions: () => [],
    after: async () => CITA_FOUND_MESSAGE,
};
```

- [ ] **Step 2: Verify build + full test suite**

Run: `npm test`
Expected: build clean; all suites pass (`telegram`, `errors`, `backoff`, `citaResult`, `office`, `parsers`), `# fail 0`. (The existing integration `flow.test.ts` still passes — it does not import `citaSelectStep`; it is rewritten in Phase 4.)

- [ ] **Step 3: Commit**

```bash
git add src/steps/07-citaSelect.ts
git commit -m "feat(steps): rewrite citaSelect as settle-race + classifyCitaResult watcher check"
```

**Phase 3 done when:** `npm test` green (including the new `classifyCitaResult` suite), `07` compiles against the new helpers, changes committed.

---

## Phase 4 — Pipeline steps + registration + integration test

**Prerequisites / cold-start state:** Phases 1–3 committed. `classifyCitaResult`/`CITA_POSITIVE_SELECTOR` exist in `parsers.ts`; `07-citaSelect.ts` is the watcher version; config has `entryPath`/`pollDelaySeconds`/`nacionalidad`. `src/steps/00-selectRegion.ts` still navigates to the hard-coded `/icpco/citar` and selects `#form`; `src/steps/03-personalId.ts` still uses `#txtNombre` with no nationality; `src/steps/index.ts` still registers all 8 steps. `npm test` green.

**Why fourth:** Wires the watcher's input steps and reduces `defaultSteps` to 5. Depends on the config fields (P1) and on `classifyCitaResult` (P3, used by the rewritten integration test).

**Task independence:** 4.1 (integration test + combined fixture) is independent and best done first (TDD). 4.2 (`00`) and 4.3 (`03`) touch different files and are safe to parallelize. 4.4 (`index.ts`) is a small registration edit, independent of 4.2/4.3 content.

### Task 4.1: Rewrite the integration test (TDD)

**Files:**
- Create: `tests/fixtures/bcn_combined.html`
- Modify (full rewrite): `src/tests/integration/flow.test.ts`

**Interfaces:**
- Consumes: `classifyCitaResult` (P3); Patchright `chromium`.

The new integration test pins the two browser-dependent behaviors of the watcher: (a) selecting "Cualquier oficina" (`#sede`=99) populates `#tramiteGrupo[0]` asynchronously (mirroring `cargaTramites()`), then the exact tramite label is selectable — this codifies the step-0 selector contract; (b) the three result fixtures classify correctly *after the browser serializes them* (catches attribute-quote/serialization mismatches the pure string test can't). The old Alicante cases (`#idSede`, phone/email, `#cita_*`/`#chkTotal`) are dropped — those DOM elements are not on the watcher path; `matchOffice`/date-parser coverage remains in the untouched unit tests.

- [ ] **Step 1: Create `tests/fixtures/bcn_combined.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Oficina y trámite</title></head>
<body>
<div id="cookieBanner">
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

- [ ] **Step 2: Replace the entire contents of `src/tests/integration/flow.test.ts`**

```ts
/**
 * Integration tests for the Barcelona watcher: drive fixture HTML with Patchright.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import * as fs from 'fs'
import { chromium } from 'patchright'
import { classifyCitaResult, type CitaResult } from '../../lib/parsers'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')

async function loadFixture(name: string): Promise<string> {
    return fs.promises.readFile(path.join(FIXTURES, `${name}.html`), 'utf-8')
}

const TRAMITE_LABEL =
    'POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013'

describe('Combined office + tramite page', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>
    before(async () => { browser = await chromium.launch({ headless: true }) })
    after(async () => { await browser?.close() })

    it('selecting Cualquier oficina populates tramiteGrupo[0] and the tramite is selectable', async () => {
        const page = await browser.newPage()
        await page.setContent(await loadFixture('bcn_combined'), { waitUntil: 'domcontentloaded' })

        await page.selectOption('#sede', { value: '99' })
        // An <option> in a closed <select> has an empty bounding box, so it is never 'visible' to
        // Playwright — a default waitForSelector would hang to timeout. Wait for the target option
        // (matched by label, not position) to be ATTACHED to the DOM.
        await page
            .locator('#tramiteGrupo\\[0\\]')
            .locator('option', { hasText: TRAMITE_LABEL })
            .waitFor({ state: 'attached', timeout: 5000 })
        await page.selectOption('#tramiteGrupo\\[0\\]', { label: TRAMITE_LABEL })

        const value = await page.$eval('#tramiteGrupo\\[0\\]', (el: HTMLSelectElement) => el.value)
        assert.strictEqual(value, '1')
        await page.close()
    })
})

describe('Cita result classification (browser-serialized HTML)', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>
    before(async () => { browser = await chromium.launch({ headless: true }) })
    after(async () => { await browser?.close() })

    const cases: [string, CitaResult][] = [
        ['bcn_no_citas', 'no-citas'],
        ['bcn_waf', 'waf'],
        ['bcn_citas_available', 'available'],
    ]
    for (const [fixture, expected] of cases) {
        it(`classifies ${fixture} as ${expected} after the browser serializes it`, async () => {
            const page = await browser.newPage()
            await page.setContent(await loadFixture(fixture), { waitUntil: 'domcontentloaded' })
            assert.strictEqual(classifyCitaResult(await page.content()), expected)
            await page.close()
        })
    }
})
```

- [ ] **Step 3: Run the integration test to verify it passes**

Run: `npx tsc && node --test dist/tests/integration/flow.test.js`
Expected: PASS — `# pass 4`, `# fail 0`. (If you run this step *before* creating `bcn_combined.html`, the combined-page test fails with a file-not-found — the red state. With Step 1 done, it is green.)

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/bcn_combined.html src/tests/integration/flow.test.ts
git commit -m "test(integration): rewrite flow test for the Barcelona watcher path"
```

### Task 4.2: Rewrite `00-selectRegion.ts`

**Files:**
- Modify (full rewrite): `src/steps/00-selectRegion.ts`

**Interfaces:**
- Consumes: `config.entryPath` (fallback `/icpco/citar`), `config.tramiteLabel`, `config.baseUrl`; `move`/`click`/`label`/`select` (`./actions`); `SELECTOR_TIMEOUT_MS` (`./wait`); `StepDataKey.CookieBannerVisible`.
- Produces: `selectRegionStep` (same export, `StepId.RegionSelect`). Navigates to `baseUrl + entryPath`; waits for `#sede`; detects an "Acepto" cookie button; pipeline selects `#sede`=99 (fires `cargaTramites()`), waits for `#tramiteGrupo[0]` to populate, selects the tramite by label, clicks `#btnAceptar`.

Note (OPEN QUESTIONS #2/#3): the cookie dismissal uses a generic `getByText('Acepto', { exact: true })`. The wait-for-populate waits for the target tramite `<option>` (matched by **label**) to be **`attached`** — not `visible` (an `<option>` in a closed `<select>` has an empty bounding box and is never "visible", so a default `waitForSelector` would hang the whole `SELECTOR_TIMEOUT_MS`), and not positional (`option:nth-child(2)`). Both the cookie selector and the populate-wait may still need adjustment after the dry run if the live `data-live-search` widget doesn't sync the underlying `<select>` (spec §11).

- [ ] **Step 1: Replace the entire contents of `src/steps/00-selectRegion.ts`**

```ts
import { Step, StepDataKey } from './types';
import type { Action } from '../bot/pipeline';
import { StepId } from './types';
import { move, click, label, select } from './actions';
import { RetryError } from '../bot/errors';
import { SELECTOR_TIMEOUT_MS } from './wait';
import { rand, sleep } from '../misc';

const DEFAULT_ENTRY_PATH = '/icpco/citar';
const ANY_OFFICE_VALUE = '99';
const TRAMITE_SELECT = '#tramiteGrupo\\[0\\]';

export const selectRegionStep: Step = {
    id: StepId.RegionSelect,
    waitFor: undefined, // before handles navigation + wait
    before: async (ctx) => {
        const base = ctx.config.baseUrl ?? 'https://icp.administracionelectronica.gob.es';
        const entryPath = ctx.config.entryPath ?? DEFAULT_ENTRY_PATH;
        const url = `${base}${entryPath}`;
        console.log(`[${StepId.RegionSelect}] Navigating to ${url}`);
        const gotoRes = await ctx.page.goto(url);
        if (gotoRes?.status() === 403) throw new RetryError('Proxy forbidden (403)', 5000, true, true);
        await ctx.page.waitForSelector('#sede', { timeout: SELECTOR_TIMEOUT_MS });
        const visible = await ctx.page
            .getByText('Acepto', { exact: true })
            .first()
            .isVisible({ timeout: 2000 })
            .catch(() => false);
        ctx.data[StepDataKey.CookieBannerVisible] = visible;
        console.log(`[${StepId.RegionSelect}] Cookie banner ${visible ? 'visible, will dismiss' : 'not visible'}`);
        await sleep(rand(1500, 2000));
    },
    actions: (ctx) => {
        const pipeline: Action[] = [
            select('#sede', { value: ANY_OFFICE_VALUE }),
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
        ];
        if (ctx.data[StepDataKey.CookieBannerVisible]) {
            const cookieClick = label(
                (({ page }) => page.getByText('Acepto', { exact: true }).first().click({ timeout: 3000 })) as Action,
                'click(Acepto)'
            );
            pipeline.unshift(cookieClick);
        }
        return pipeline;
    },
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc`
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git add src/steps/00-selectRegion.ts
git commit -m "feat(steps): rewrite selectRegion for Barcelona combined office+tramite page"
```

### Task 4.3: Rewrite `03-personalId.ts`

**Files:**
- Modify (full rewrite): `src/steps/03-personalId.ts`

**Interfaces:**
- Consumes: `config.personalData.{nie, nombre, nacionalidad}`; `move`/`click`/`typeChars`/`press`/`moveRandom`/`scroll`/`select` (`./actions`).
- Produces: `personalIdStep` (same export, `StepId.PersonalId`). Types NIE into `#txtIdCitado`, name into `#txtDesCitado`, selects nationality on `#txtPaisNac` by label (only when `nacionalidad` is set), clicks `#btnEnviar`.

- [ ] **Step 1: Replace the entire contents of `src/steps/03-personalId.ts`**

```ts
import type { Step } from './types';
import { StepId } from './types';
import { move, click, typeChars, press, moveRandom, scroll, select } from './actions';
import type { Action } from '../bot/pipeline';
import { rand, sleep } from '../misc';

export const personalIdStep: Step = {
    id: StepId.PersonalId,
    waitFor: '#btnEnviar',
    before: async () => {
        await sleep(rand(1500, 2000));
    },
    actions: (ctx) => {
        const { nie, nombre, nacionalidad } = ctx.config.personalData;
        const pipeline: Action[] = [
            moveRandom(),
            click('#txtIdCitado'),
            typeChars(nie),
            rand(0, 100) < 50 ? press('Tab') : click('#txtDesCitado'),
            typeChars(nombre),
        ];
        if (nacionalidad) {
            pipeline.push(select('#txtPaisNac', { label: nacionalidad }));
        }
        pipeline.push(scroll('#btnEnviar'), move('#btnEnviar'), click('#btnEnviar'));
        return pipeline;
    },
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc`
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git add src/steps/03-personalId.ts
git commit -m "feat(steps): rewrite personalId for Barcelona NIE/name/nationality fields"
```

### Task 4.4: Reduce `defaultSteps` to the 5 watcher steps

**Files:**
- Modify: `src/steps/index.ts:1-20`

**Interfaces:**
- Produces: `defaultSteps` containing exactly `[selectRegionStep, entrarStep, personalIdStep, personalIdConfirmStep, citaSelectStep]`. `tramiteStep`/`officeStep`/`personalContactStep` are no longer imported or registered (files stay on disk and still compile).

- [ ] **Step 1: Replace lines 1-20 of `src/steps/index.ts`**

```ts
import type { Step } from './types';
import { selectRegionStep } from './00-selectRegion';
import { entrarStep } from './02-entrar';
import { personalIdStep } from './03-personalId';
import { personalIdConfirmStep } from './04-personalIdConfirm';
import { citaSelectStep } from './07-citaSelect';

// Barcelona toma-de-huellas watcher: 5 steps (spec §4). 01-tramite (merged into step 0),
// 05-office (any-office) and 06-personalContact (page not reached) are kept on disk but
// unregistered. StepId members for them stay in the enum (still referenced by the runner).
export const defaultSteps: Step[] = [
    selectRegionStep,
    entrarStep,
    personalIdStep,
    personalIdConfirmStep,
    citaSelectStep,
];
```

(Leave lines 22-25 — the re-exports — unchanged.)

- [ ] **Step 2: Verify build + full test suite**

Run: `npm test`
Expected: build clean; all suites pass (`telegram`, `errors`, `backoff`, `citaResult`, `office`, `parsers`, integration `flow`), `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add src/steps/index.ts
git commit -m "feat(steps): register the 5-step Barcelona watcher pipeline"
```

**Phase 4 done when:** `npm test` green (unit + integration), the pipeline is 5 steps, changes committed.

---

## Phase 5 — Mock server + scripts + docs + final verification

**Prerequisites / cold-start state:** Phases 1–4 committed. The watcher pipeline (5 steps), config, classifier, backoff, and Telegram are all in place and unit/integration-tested. `src/mock-server/index.ts` + `mock-server/pages/*.html` are still the Alicante 7-step flow; `package.json`'s `mock:bot` still waits on `/icpco/citar`. `npm test` green.

**Why last:** The mock must serve the 5-step flow that matches the rewritten steps; it's the offline harness for the manual acceptance run. No new automated tests here (the mock is exercised manually per spec §10.5) — the phase still gates on `tsc` clean + `npm test` green + commit.

**Task independence:** 5.1 (pages) and 5.2 (server) can be authored in parallel (the server only reads the pages at runtime). 5.3 (package.json) is independent. 5.4 (README + verification) comes last.

### Task 5.1: Barcelona mock pages

**Files:**
- Create: `mock-server/pages/bcn_combined.html`
- Create: `mock-server/pages/bcn_entrar.html`
- Create: `mock-server/pages/bcn_nie.html`
- Create: `mock-server/pages/bcn_confirm.html`
- Create: `mock-server/pages/bcn_no_citas.html`
- Create: `mock-server/pages/bcn_citas_available.html`

Each interactive page submits its form to `/icpplustieb/advance` (the mock's advance endpoint). The result pages don't submit — the watcher classifies and stops/restarts there. (Old Alicante `step*.html` pages may stay on disk; they're no longer referenced.)

- [ ] **Step 1: Create `mock-server/pages/bcn_combined.html`**

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

- [ ] **Step 2: Create `mock-server/pages/bcn_entrar.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Instrucciones</title></head>
<body>
<form name="datosCita" action="/icpplustieb/advance" method="post">
    <div id="btnEntrar" style="cursor:pointer;padding:8px;border:1px solid #333;display:inline-block" onclick="document.forms['datosCita'].submit()">Presentación sin Cl@ve</div>
</form>
</body>
</html>
```

- [ ] **Step 3: Create `mock-server/pages/bcn_nie.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Datos personales</title></head>
<body>
<form name="datosCita" action="/icpplustieb/advance" method="post">
    <label for="txtIdCitado">NIE</label>
    <input id="txtIdCitado" name="txtIdCitado" maxlength="9">
    <label for="txtDesCitado">Nombre</label>
    <input id="txtDesCitado" name="txtDesCitado" onchange="comprobarDatos()">
    <label for="txtPaisNac">Nacionalidad</label>
    <select id="txtPaisNac" name="txtPaisNac" required>
        <option value="">Seleccione país...</option>
        <option value="222">ECUADOR</option>
    </select>
    <input id="btnEnviar" type="button" value="Enviar" onclick="document.forms['datosCita'].submit()">
</form>
<script>function comprobarDatos() {}</script>
</body>
</html>
```

- [ ] **Step 4: Create `mock-server/pages/bcn_confirm.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Confirmar</title></head>
<body>
<form name="datosCita" action="/icpplustieb/advance" method="post">
    <input id="btnEnviar" type="button" value="Solicitar Cita" onclick="document.forms['datosCita'].submit()">
</form>
</body>
</html>
```

- [ ] **Step 5: Create `mock-server/pages/bcn_no_citas.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sin citas</title></head>
<body>
<div id="mensajeInfo">En este momento no hay citas disponibles. En breve, la Oficina pondrá a su disposición nuevas citas.</div>
<input id="btnSubmit" type="button" value="Aceptar" onclick="location.href='/icpplustieb/citar?p=8&locale=es'">
</body>
</html>
```

- [ ] **Step 6: Create `mock-server/pages/bcn_citas_available.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Citas disponibles</title></head>
<body>
<form name="datosCita" action="/icpplustieb/advance" method="post">
    <fieldset>
        <legend>Citas disponibles</legend>
        <div id="cita_1"><label for="cita1"><strong>CITA 1</strong></label>
            <input type="radio" id="cita1" name="rdbCita" value="1"></div>
        <div id="cita_2"><label for="cita2"><strong>CITA 2</strong></label>
            <input type="radio" id="cita2" name="rdbCita" value="2"></div>
    </fieldset>
    <input id="btnSubmit" type="submit" value="Aceptar">
</form>
</body>
</html>
```

- [ ] **Step 7: Commit**

```bash
git add mock-server/pages/bcn_combined.html mock-server/pages/bcn_entrar.html mock-server/pages/bcn_nie.html mock-server/pages/bcn_confirm.html mock-server/pages/bcn_no_citas.html mock-server/pages/bcn_citas_available.html
git commit -m "test(mock): add Barcelona watcher flow pages"
```

### Task 5.2: Rewrite the mock server routing

**Files:**
- Modify (full rewrite): `src/mock-server/index.ts`

**Interfaces:**
- Produces: HTTP server. `GET /icpplustieb/citar` resets the session to step 0 and serves the combined page (the bot's `page.goto` on every (re)start — this is what makes the `RestartFromBeginning` poll loop work). `POST /icpplustieb/advance` advances one step (cap 4) and 302-redirects to `GET /icpplustieb/page`, which serves the current step page. `MOCK_NO_CITA=1` serves `bcn_no_citas.html` at the result step, else `bcn_citas_available.html`.

Routing rationale: forward navigation uses a *separate* path (`/icpplustieb/page`) that does NOT reset, so only the bot's entry `goto` restarts the flow. Step indices map: 0 combined, 1 entrar, 2 nie, 3 confirm, 4 result.

- [ ] **Step 1: Replace the entire contents of `src/mock-server/index.ts`**

```ts
/**
 * Mock server for manual integration testing of the Barcelona toma-de-huellas watcher.
 * Serves the 5-step flow so `npm run mock:bot` exercises it offline.
 *
 * Usage:
 *   npm run mock      (then set baseUrl: "http://localhost:3999" in config.json and run the bot)
 *   npm run mock:bot  (starts server + bot together)
 *
 * Env: MOCK_PORT (default 3999), MOCK_NO_CITA=1 serves the "no citas" page at the result step.
 */
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { parse as parseUrl } from 'url'

const PORT = parseInt(process.env.MOCK_PORT || '3999', 10)
const MOCK_NO_CITA = process.env.MOCK_NO_CITA === '1'

const PAGES_DIR = path.join(process.cwd(), 'mock-server', 'pages')

const SESSION_COOKIE = 'mock-session'
const LAST_STEP = 4
const sessions = new Map<string, number>()

function getStep(sessionId: string): number {
    return sessions.get(sessionId) ?? 0
}

function advanceStep(sessionId: string): number {
    const next = Math.min(getStep(sessionId) + 1, LAST_STEP)
    sessions.set(sessionId, next)
    return next
}

function parseCookie(header: string | undefined): string | null {
    if (!header) return null
    const m = header.match(/mock-session=([^;\s]+)/)
    return m ? m[1] : null
}

function getOrCreateSession(req: http.IncomingMessage, res: http.ServerResponse): string {
    let id = parseCookie(req.headers.cookie)
    if (!id) {
        id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${id}; Path=/`)
    }
    return id
}

function serveHtml(res: http.ServerResponse, html: string) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(html)
}

function pageForStep(step: number): string {
    const files: Record<number, string> = {
        0: 'bcn_combined.html',
        1: 'bcn_entrar.html',
        2: 'bcn_nie.html',
        3: 'bcn_confirm.html',
        4: MOCK_NO_CITA ? 'bcn_no_citas.html' : 'bcn_citas_available.html',
    }
    return fs.readFileSync(path.join(PAGES_DIR, files[step]), 'utf-8')
}

const server = http.createServer((req, res) => {
    const sessionId = getOrCreateSession(req, res)
    const parsed = parseUrl(req.url || '/', true)
    const pathname = parsed.pathname || '/'
    const method = req.method || 'GET'

    // Entry GET (the bot's page.goto on every (re)start) resets the flow to step 0.
    if (method === 'GET' && pathname === '/icpplustieb/citar') {
        sessions.set(sessionId, 0)
        serveHtml(res, pageForStep(0))
        return
    }

    // Forward navigation after a form POST: advance one step, redirect to the (non-resetting) page GET.
    if (method === 'POST' && pathname === '/icpplustieb/advance') {
        advanceStep(sessionId)
        res.writeHead(302, { Location: '/icpplustieb/page' })
        res.end()
        return
    }
    if (method === 'GET' && pathname === '/icpplustieb/page') {
        serveHtml(res, pageForStep(getStep(sessionId)))
        return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
})

server.listen(PORT, () => {
    console.log(`Mock server (Barcelona watcher) running at http://localhost:${PORT}`)
    console.log(`  GET  /icpplustieb/citar   - reset + serve combined office/tramite page (step 0)`)
    console.log(`  POST /icpplustieb/advance - advance step, redirect to /icpplustieb/page`)
    console.log(`  GET  /icpplustieb/page    - serve current step page`)
    if (MOCK_NO_CITA) console.log(`  (MOCK_NO_CITA=1: serving no-citas at the result step)`)
})
```

- [ ] **Step 2: Verify build**

Run: `npx tsc`
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git add src/mock-server/index.ts
git commit -m "feat(mock): rewrite routing for the 5-step Barcelona watcher flow"
```

### Task 5.3: Update the `mock:bot` wait URL

**Files:**
- Modify: `package.json:18`

- [ ] **Step 1: Edit the `mock:bot` script**

Replace line 18:

```json
    "mock:bot": "tsc && start-server-and-test mock:server http://localhost:3999/icpco/citar start",
```

with:

```json
    "mock:bot": "tsc && start-server-and-test mock:server http://localhost:3999/icpplustieb/citar start",
```

- [ ] **Step 2: Verify the package.json still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(mock): point mock:bot wait URL at the Barcelona entry"
```

### Task 5.4: README mock-server docs + full verification

**Files:**
- Modify: `README.md` (mock-server section + features)

- [ ] **Step 1: Update the mock-server section in `README.md`**

Replace the "Env vars" line under "### Manual integration testing (mock server)" (~line 67):

```markdown
Env vars: `MOCK_PORT` (default 3999), `MOCK_NO_CITA=1` to serve the "no citas" page at the result
step (the watcher then loops: no-citas → randomized `pollDelaySeconds` backoff → restart from step 0).
Without the flag, the result step serves a "citas available" page, the watcher classifies it as
available, fires `notifyCitaFound`, and stops with the browser open for manual booking.
```

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`
Expected: build clean; suites pass — `telegram` (6), `errors` (2), `backoff` (4), `citaResult` (5), `office` (4), `parsers` (existing), integration `flow` (4); `# fail 0`.

- [ ] **Step 3: Manual acceptance — mock no-citas loop (spec §10.5)**

Temporarily set `"baseUrl": "http://localhost:3999"` and `"pollDelaySeconds": [3, 5]` in `config.json` (small values so the loop is observable), then run:

Run: `MOCK_NO_CITA=1 npm run mock:bot`
Expected: bot logs walk `REGION_SELECT → ENTRAR → PERSONAL_ID → PERSONAL_ID_CONFIRM → CITA_SELECT`, then `[CITA_SELECT] Result page classified as: no-citas`, then `No citas: retrying...` and a `~3–5 s` sleep before restarting from `REGION_SELECT`. Ctrl-C to stop. (Restore `pollDelaySeconds` / remove the mock `baseUrl` afterwards.)

- [ ] **Step 4: Manual acceptance — mock cita-found stop (spec §10.5)**

Run: `npm run mock:bot`
Expected: the flow reaches `[CITA_SELECT] Result page classified as: available`, `notifyCitaFound` logs `NOTIFICATION: Cita bot: Suitable cita found! Cita(s) available in Barcelona — book manually. - Complete manually.`, and the runner stops at `Press Enter to skip urgent notification...` (browser stays open). Ctrl-C to stop.

- [ ] **Step 5: Manual acceptance — Telegram send (spec §10.7)**

With a real `notifications.telegram` block in `config.json`, send one test message:

Run: `npm run build && node -e "const {loadConfig}=require('./dist/config');const {sendTelegram}=require('./dist/notifications/telegram');sendTelegram(loadConfig(),{title:'CitaBot test',message:'Telegram wired correctly'}).then(()=>console.log('sent'))"`
Expected: `sent` and the message arrives in the Telegram chat. Confirm no token appears in the console output.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document the Barcelona watcher mock loop behaviour"
```

- [ ] **Step 7: Manual dry run (spec §10.8) — confirm the UNVERIFIED selectors**

> This is the **gating manual step** before trusting the watcher on the live site. With a real
> `config.json` (real NIE, `baseUrl` unset), do **one careful** real-site run and confirm against
> `/icpplustieb/`:
> 1. **The §5.3 positive cita anchor** (OPEN QUESTION #1) — currently `input[name="rdbCita"]`,
>    defined once as `CITA_POSITIVE_TOKEN` in `src/lib/parsers.ts`. If the real slot page uses a
>    different element, update `CITA_POSITIVE_TOKEN` (the selector + classifier both derive from it)
>    and the two `bcn_citas_available.html` files (fixture + mock page).
> 2. **The cookie banner** (OPEN QUESTION #2) — the generic `getByText('Acepto')` dismissal in
>    `00-selectRegion.ts`.
> 3. **`data-live-search` widgets** (OPEN QUESTION #3) — that `selectOption` on `#sede` fires
>    `cargaTramites()` and that `#txtPaisNac` selection sticks; if not, add a widget click /
>    input-event dispatch.
>
> Document findings; if a selector changed, update the relevant file(s), re-run `npm test`, and
> commit. Be mindful of the 24–74 h NIE shadow-ban risk (README) — do not loop the live site to test.

**Phase 5 done when:** `npm test` green, the mock `mock:bot` loop and cita-found stop both observed, Telegram verified, the dry-run selector confirmation completed (or its findings recorded), changes committed.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- §2 decisions — Telegram (P1), any-cita by-negation gated on positive anchor (P3), Cualquier oficina `#sede`=99 (P4), notify-and-stop (existing runner happy path, P3 success string), randomized `pollDelaySeconds` (P2), WAF back-off not crash (P2/P3). ✔
- §3 flow map / §4 pipeline — steps 00/02/03/04/07 reused with Barcelona selectors (P3/P4); StepId reuse honored; dropped files kept on disk (P1 guards `06`, P4 unregisters in `index.ts`). ✔
- §5 CitaCheck — settle-race + `classifyCitaResult`; WAF→`WafBackoffError`, no-citas→`RestartFromBeginning`, available→success string, timeout/unknown→`RetryError`; success gated on anchor-present (P3). ✔
- §6 config — `entryPath`, `pollDelaySeconds`, `nacionalidad`, optional `telefono`/`email`, `notifications.telegram`, `citaFoundChannels` union, example + README (P1). ✔
- §7 notifications — `sendTelegram` URL/body, fail-soft, token-safe logging, wired into `notifyCitaFound`/`notifyFailure` (P1). ✔
- §8 runner — `pollSleepMs` fallback 5000, dedicated `WafBackoffError` branch (long sleep + clear cookies), no other recovery change (P2). ✔
- §9 mock — routing + 5-step map + reset-on-entry + pages + `package.json` wait URL (P5). ✔
- §10 testing — TDD unit (`classifyCitaResult`, `sendTelegram`, `backoff`, `WafBackoffError`); fixtures; integration rewrite; `tsc`/`npm test`; mock loop; matchOffice/parser tests kept green; Telegram send; real-site dry run (P1–P5). ✔
- §11 risks — anchor/cookie/live-search flagged as OPEN QUESTIONS routed to the §10.8 dry run; token-in-logs handled (P1); poll-not-in-stats accepted (no change). ✔
- §12 non-goals — no auto-book/captcha/slot-parsing/other provinces. ✔

**Placeholder scan:** No "TBD"/"add error handling"/"write tests for the above"; every code step shows complete code; every command has expected output. ✔

**Type consistency:** `classifyCitaResult`/`CitaResult`/`CITA_POSITIVE_SELECTOR`/`CITA_POSITIVE_TOKEN` (parsers) match their uses in `07` and the integration test; `pollSleepMs`/`wafBackoffMs`/`DEFAULT_POLL_MS`/`WAF_BACKOFF_*` (backoff) match the runner + test; `WafBackoffError` (errors) matches the runner branch + `07`; `sendTelegram`/`buildTelegramUrl`/`buildTelegramBody` (telegram) match `notifications.ts` + the test. ✔
