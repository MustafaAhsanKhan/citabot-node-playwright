# Chrome Profiles

This directory stores Chrome browser profiles used by the bot. Each profile maps to the `browserProfile` field in `config.json` (e.g. `"browserProfile": "test"` uses `profiles/test/`).

Profiles persist cookies, extensions, cached session state, and installed extensions across bot runs. Profile data (cache, cookies, extension state) is excluded from version control via `.gitignore` — only this README is tracked.

---

## Installing the Chromixer Extension into a Bot Profile

For the best bot detection evasion, install the [Chromixer](https://github.com/arman-bd/chromixer) fingerprint protection extension into your bot's Chrome profile. Chromixer adds session-based noise to Canvas, WebGL, Audio, fonts, hardware concurrency, and other fingerprinting vectors — the most effective protection against browser fingerprinting.

### Step 1 — Clone Chromixer

```bash
git clone https://github.com/arman-bd/chromixer.git
```

### Step 2 — Launch Chrome manually with the bot profile

You need to open Chrome using the **same profile directory** the bot will use, so that extensions installed here are available when the bot runs.

**Windows:**
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="<absolute-path-to-repo>\profiles\test"
```

**macOS:**
```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir="<absolute-path-to-repo>/profiles/test"
```

**Linux:**
```
google-chrome --user-data-dir="<absolute-path-to-repo>/profiles/test"
```

Replace `<absolute-path-to-repo>` with the full path to this repository and `test` with your `browserProfile` value from `config.json`.

### Step 3 — Install Chromixer in the profile

1. In the Chrome window that opened, navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `chromixer/extension` directory from the cloned repo

Chromixer should now appear in the extensions list and its icon will appear in the toolbar.

### Step 4 — Close Chrome and run the bot

Close the Chrome window. The bot will reuse the same profile (with Chromixer installed) when it launches:

```bash
npm start
```

---

## Notes

- If you change `browserProfile` in `config.json`, repeat the steps above for the new profile name (create a new subdirectory entry by pointing Chrome to `profiles/<new-name>`).
- The profile directory will be created automatically by Chrome on first launch.
- Do not commit profile data — it is gitignored. Only this README is tracked.
