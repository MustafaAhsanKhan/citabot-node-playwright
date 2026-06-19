# CitaBot

Automated bot for Spanish administrative appointment (cita previa) booking with anti-bot evasion.

> **Disclaimer:** This project is provided for educational and non-commercial use only. The author is not responsible for any damage, data loss, account bans, legal implications, or any other consequences arising from the use of this software. Use this repository entirely at your own risk and ensure compliance with the terms of service of any website you interact with.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Anti-Bot Evasion Techniques](#anti-bot-evasion-techniques)
- [Fingerprint Protection with Chromixer](#fingerprint-protection-with-chromixer)
- [Actors Configuration](#actors-configuration)
- [Adapting to Your Own Cita](#adapting-to-your-own-cita)
- [Home Assistant Notifications](#home-assistant-notifications)
- [Directories](#directories)
- [Known Limitations and Gotchas](#known-limitations-and-gotchas)
- [Features](#features)
- [Disclaimer](#disclaimer)

---

## Installation

1. Clone the repository
2. `npm install`
3. `npx patchright install chromium`
4. Copy `config.example.json` to `config.json` and fill in your values
5. Optionally merge actors from `config.actors.example.json` into your config

---

## Configuration

All inputs come from `config.json`. See `config.example.json` for structure.

| Field | Description |
|-------|-------------|
| `browserProfile` | Chrome profile directory name under `profiles/` (default: `test`) |
| `baseUrl` | Override cita site URL (e.g. `http://localhost:3999` for mock server) |
| `location` | ICP location code (e.g. `3` for Alicante) |
| `tramiteLabel` | Full tramite/procedure label (exact text as shown on the site) |
| `offices` | Array of office names (priority order); first match is selected |
| `minCitaDate` | Minimum cita date `YYYY-MM-DD` |
| `entryPath` | Cita site entry path (Barcelona watcher: `/icpplustieb/citar?p=8&locale=es`). Falls back to `/icpco/citar` when unset. |
| `pollDelaySeconds` | `[min, max]` seconds; randomized backoff between poll cycles (default `5` s when unset). Raise to lower shadow-ban risk. |
| `personalData` | NIE, nombre, telefono, email |
| `personalData.nacionalidad` | Exact `<option>` label on the nationality select (e.g. `ECUADOR`). |
| `proxy` | Single proxy (server, username, password) |
| `proxies` | Array of proxies for rotation (on 429 or 5 bot detections) |
| `actors` | Human-behavior actor profiles (see [Actors Configuration](#actors-configuration)) |
| `keepBrowserOpenOnFailure` | Keep browser open when error at cita/confirm step (default: true) |
| `notifications` | `failureCountThreshold`, `criticalAfterSeconds`, `homeassistant` url+token, `telegram` botToken+chatId |

---

## Usage

- `npm run build` – compile TypeScript
- `npm start` – run the bot

### Manual integration testing (mock server)

Set `baseUrl: "http://localhost:3999"` in `config.json`, then either:

- **Single command:** `npm run mock:bot` – starts mock server and bot together
- **Separate terminals:** `npm run mock` in one, `npm start` in another

Env vars: `MOCK_PORT` (default 3999), `MOCK_NO_CITA=1` to serve the "no citas" page at step 6.

---

## Anti-Bot Evasion Techniques

CitaBot implements multiple layers of human-behavior simulation to avoid detection:

### Human-like cursor behavior

Mouse movements are powered by [`ghost-cursor-playwright`](https://github.com/Xetera/ghost-cursor), which generates natural Bezier-curve trajectories with overshoot and micro-corrections. All movements include randomized pre-movement and pre-click delays. Between pipeline steps, random cursor movements (`moveRandom`) are injected probabilistically to simulate idle user behavior.

### Human-like scrolling

Scrolling uses incremental mouse wheel events instead of instant jumps. Each scroll is split into small steps with random sizes (70–100% of `maxScrollStep`), and random delays are inserted between steps (`scrollDelay`). The target scroll position is randomized within a 30–70% viewport window to avoid predictable element-centering patterns.

### Human-like keyboard input

Keystrokes are typed character by character with per-character delays derived from `baseDelay ± delayVariance`. Additional pauses are added after punctuation and spaces to replicate natural inter-word rhythm. The `mistakeChance` parameter enables deliberate typos (selecting an adjacent QWERTY key), immediately followed by a Backspace correction — mimicking realistic human typing.

### Fingerprint avoidance

The most effective protection is browser fingerprint spoofing via the [Chromixer](https://github.com/arman-bd/chromixer) extension (see [below](#fingerprint-protection-with-chromixer)). The bot uses native Chrome (`channel: 'chrome'`) through [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright), a Playwright fork designed for stealth automation that patches several Playwright-specific automation fingerprints.

### Randomized timeouts between actions

Every pipeline action waits a random delay drawn from configurable ranges: `delayBetweenActions`, `delayBeforeFirstAction`, `delayBeforeLastAction`. On bot detection, `randomMoveProbability` is increased (from 2% to 15%) to inject more idle cursor movement. Viewport dimensions are also randomized from a set of common presets on each new browser session.

---

## Fingerprint Protection with Chromixer

For stronger fingerprint evasion, install the [**Chromixer**](https://github.com/arman-bd/chromixer) Chrome extension into your bot's browser profile. Chromixer adds session-based noise to 12 fingerprinting vectors — Canvas, WebGL, Audio Context, fonts, hardware concurrency, screen dimensions, Battery API, plugins, media devices, WebRTC, Client Rects, and Gamepad API — making each session appear as a new unique visitor to fingerprinting scripts.

**Why it matters:** Most advanced bot detection systems rely primarily on browser fingerprinting. Human-like mouse movement and typing alone are not sufficient if the browser presents an automation fingerprint. Chromixer addresses this layer directly.

See [`profiles/README.md`](profiles/README.md) for step-by-step instructions on how to install Chromixer into the bot's Chrome profile.

---

## Actors Configuration

Actors are human-behavior profiles that define the timing and variance of all interactions. Using multiple actors prevents the bot from developing a detectable behavioral fingerprint.

### Source

Add actors directly to `config.json` under the `actors` key, or copy them from `config.actors.example.json`. If no actors are configured, a built-in reference actor is used.

### Actor fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (used in stats) |
| `typing.baseDelay` | Base delay between keystrokes (ms) |
| `typing.delayVariance` | ± variance around `baseDelay` (ms) |
| `typing.mistakeChance` | Probability of typo per character (0–1) |
| `typingPressDelay` | `[min, max]` hold duration for key press (ms) |
| `cursor.overshootSpread` | Ghost-cursor overshoot spread factor |
| `cursor.overshootRadius` | Ghost-cursor overshoot radius |
| `cursor.waitBeforeMove` | `[min, max]` delay before cursor moves (ms) |
| `cursor.waitBeforeClick` | `[min, max]` delay before click (ms) |
| `cursor.waitBetweenClick` | `[min, max]` delay between double-click events (ms) |
| `cursor.scrollDelay` | `[min, max]` delay between scroll steps (ms) |
| `cursor.maxScrollStep` | Maximum pixels per scroll step |
| `cursor.moveRandomRange` | `[min, max]` distance for random cursor moves |
| `pipeline.delayBetweenActions` | `[min, max]` delay between pipeline actions (ms) |
| `pipeline.delayBeforeFirstAction` | `[min, max]` delay before first action in a step (ms) |
| `pipeline.delayBeforeLastAction` | `[min, max]` delay before last action in a step (ms) |

### Actor rotation

- Actors rotate between bot runs
- Per-actor run/detection/success statistics are saved to `stats/actors/`
- When all actors have been tried and detection rate is high, the worst-performing actor is replaced with a freshly generated random actor
- Use more actors with varied timing ranges to widen the behavioral spread

---

## Adapting to Your Own Cita

CitaBot is designed as a framework that can be adapted to any Spanish cita previa flow with minimal effort.

### How the flow works

The booking flow is modelled as a sequence of `Step` objects defined in [`src/steps/index.ts`](src/steps/index.ts). Each step represents one page in the multi-step form. The `BotWalker` class executes them in order, passing a shared `StepContext` (page, cursor, keyboard, pipeline, config, shared data).

A `Step` has:
- `id` — identifier from the `StepId` enum
- `waitFor` — CSS selector to wait for before the step runs
- `before` — optional async hook (cookie banners, office matching, etc.)
- `actions` — returns an array of `Action` functions that the pipeline executes with human-like delays
- `after` — optional async hook for post-action logic (e.g. parsing cita dates)

### Available actions

All actions are composable functions from [`src/steps/actions.ts`](src/steps/actions.ts):

| Action | Description |
|--------|-------------|
| `move(selector)` | Move cursor to element |
| `click(selector)` | Click element with human-like movement |
| `scroll(selector)` | Scroll element into view naturally |
| `select(selector, value)` | Select dropdown option |
| `typeChars(text)` | Type text with human-like delays |
| `press(key)` | Press a key with hold delay |
| `label(fn, name)` | Wrap any function as a named action |
| `moveRandom()` | Move cursor to random page position |

### To adapt for a different cita type

1. Set `tramiteLabel` in `config.json` to match the exact procedure text shown on the site
2. Set `location`, `offices`, `minCitaDate`, and `personalData` accordingly
3. If the page flow differs, add, remove, or modify steps in `src/steps/` and update the `defaultSteps` array in `src/steps/index.ts`
4. Adjust selectors in each step's `actions` function to match the target page
5. Use `baseUrl` pointing to the mock server (`http://localhost:3999`) during development to test without hitting the real site

---

## Home Assistant Notifications

Set `notifications.homeassistant.url` and `notifications.homeassistant.token` (long-lived token) to receive:

- Failure alert after N consecutive failures (`failureCountThreshold`, default 5)
- Cita found notification
- Critical notification if no cita response within N seconds (`criticalAfterSeconds`, default 60)

---

## Telegram Notifications

Set `notifications.telegram.botToken` and `notifications.telegram.chatId` to receive a push when a
cita is found (and on the failure alert). Create a bot via [@BotFather](https://t.me/BotFather) for
the token; get your chat ID from [@userinfobot](https://t.me/userinfobot). The token is embedded in
the request URL and is never written to logs or network dumps. Telegram fires whenever the block is
present, independent of `citaFoundChannels`.

> **Barcelona watcher behaviour:** this fork is a *watcher* — it walks the toma-de-huellas flow,
> stops the moment any cita is available, and pushes a Telegram alert. It does **not** auto-book; you
> complete the booking manually in the open browser. See the shadow-ban warning under Known Limitations.

---

## Directories

| Directory | Description |
|-----------|-------------|
| `profiles/` | Chrome profile data (gitignored; see [`profiles/README.md`](profiles/README.md)) |
| `logs/` | HTML snapshots saved when no suitable cita is found |
| `stats/actors/` | Per-actor JSON statistics (runs, detections, successes) |

---

## Known Limitations and Gotchas

### Shadow-ban by NIE / Passport

After too many failed or suspicious attempts, the website can silently block your identity document (NIE or passport number) for approximately **24–74 hours**. The ban is not obvious — the site will let you fill in all forms as normal, but will then fail with an internal error code at the final step, with no clear message in the UI.

If you suspect this has happened:
- Stop running the bot immediately
- Wait at least 24–74 hours before trying again
- Consider using a different NIE/passport if you have one available
- Rotate to a fresh proxy and browser profile when you resume

---

## Features

- Config-driven office selection by name (priority array)
- Cita date selection (earliest >= `minCitaDate`)
- Saves page HTML when no suitable dates; restarts from step 1
- Proxy rotation on 429 or after 5 bot detections
- Actor rotation with human-like behavior variants
- Statistics per actor for behavioral tuning
- Actor regeneration when all actors tried (replaces worst performer)
- Browser stays open on failure at cita/confirm step for manual recovery
- Home Assistant notifications (failure, cita found, critical)
- Mock server for local integration testing without hitting the real site

---

## Disclaimer

This software is provided for **educational and non-commercial use only**.

The author makes no warranties, express or implied, regarding the correctness, reliability, or fitness of this software for any particular purpose. The author is not liable for any damage, data loss, account suspension, legal consequences, or any other direct or indirect harm arising from the use or misuse of this code.

By using this repository you acknowledge that:

- You use it entirely at your own risk
- You are responsible for complying with all applicable laws and regulations
- You are responsible for respecting the terms of service of any website or service you interact with
- The author assumes no responsibility for any consequences of your use

This project is provided "AS IS" without warranty of any kind.
