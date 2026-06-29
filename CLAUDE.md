# CitaBot — Barcelona Toma de Huellas Watcher

Automated watcher for Spanish cita previa (appointment) booking on the Barcelona `/icpplustieb` flow. Loops until appointments appear, then notifies via Telegram/Home Assistant and keeps the browser open for manual booking.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run bot (needs `config.json`) |
| `npm run mock` | Start mock server on :3999 |
| `npm run mock:bot` | Mock server + bot together |
| `npm test` | Run all tests |

## Architecture

- **Entry:** `src/index.ts` → loads config, creates `BotWalker` with 5 steps, hands to `BotRunner`
- **Steps (Barcelona flow):** `src/steps/` — `00-selectRegion` (combined office+tramite) → `02-entrar` → `03-personalId` (NIE+name+nationality) → `04-personalIdConfirm` → `07-citaSelect` (3-way race: no-citas / WAF / available)
- **Runner:** `src/bot/runner.ts` — infinite retry loop with proxy rotation, actor rotation, WAF backoff, poll delay
- **Actions:** `src/steps/actions.ts` — composable human-like interactions (click, select, type, scroll, moveRandom)
- **Parsers:** `src/lib/parsers.ts` — `classifyCitaResult()` classifies the final page as `no-citas | waf | available | unknown`

## Key Bugs Fixed (local, not upstream)

1. **`07-citaSelect.ts` strict mode violation** — `CITA_POSITIVE_SELECTOR` matches multiple radio buttons; Playwright's `waitFor` needs `.first()` to avoid strict mode error.
2. **Navigation timing in `07-citaSelect.ts`** — After confirm step submits, must wait for `#btnEnviar` to disappear + `domcontentloaded` before running the settle race.
3. **`channel: 'chrome'` in `browser.ts`** — Requires Google Chrome installed. Remove for bundled Chromium (mock testing), add back for real site (better fingerprint).

## Config (`config.json`)

- `baseUrl` — set to `http://localhost:3999` for mock, remove/omit for real site
- `entryPath` — `/icpplustieb/citar?p=8&locale=es` for Barcelona
- `pollDelaySeconds` — `[45, 90]` randomized backoff between retry cycles
- `personalData` — NIE, nombre, nacionalidad, telefono, email
- `proxies` — array of `{server, username, password}` (server needs `http://` scheme)
- `extensions` — absolute paths to unpacked Chrome extensions (e.g. Chromixer)

## Mock Server

Serves 5-step flow at `/icpplustieb/citar`. Session-based (cookies). `MOCK_NO_CITA=1` env var makes step 4 return "no citas" page.

## Anti-Detection Layers

1. Ghost-cursor (Bezier mouse movements with overshoot)
2. Human-like typing (per-char delays, typo simulation)
3. Actor profiles (rotated timing fingerprints)
4. `select()` action does real click+Escape+selectOption (not bare selectOption)
5. Patchright (Playwright fork patching automation fingerprints)
6. Chromixer extension (canvas/WebGL/audio fingerprint noise)
7. Randomized viewport, poll delays, cursor drift between actions
