/**
 * Manual recording mode: opens the cita site in a browser with NetworkRecorder attached.
 * Records all mouse/keyboard actions (timing, delays, hold durations) for comparison with automated runs.
 * Press Enter to dump the recorded network activity and actions to logs/manual-session/
 */
import { loadConfig, getProxies } from './config';
import NewBrowser from './bot/browser';
import { NetworkRecorder } from './bot/network-recorder';
import {
    installActionRecorder,
    collectRecordedActions,
    ensureRecordersInjected,
} from './bot/action-recorder';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const CITA_PATH = '/icpco/citar';

async function waitForEnter(message: string): Promise<void> {
    const rl = readline.createInterface({ input, output });
    await rl.question(`${message}\n`);
    rl.close();
}

(async () => {
    const config = loadConfig();
    const browserProfile = config.browserProfile ?? 'test';
    const proxies = getProxies(config);
    const proxy = proxies.length > 0 ? proxies[0] : undefined;
    const baseUrl = config.baseUrl ?? 'https://icp.administracionelectronica.gob.es';
    const startUrl = baseUrl.replace(/\/$/, '') + CITA_PATH;

    console.log('Launching browser for manual recording...');
    if (proxy) console.log(`Using proxy ${proxy.server}`);
    const browser = await NewBrowser({ userName: browserProfile, proxy });

    await installActionRecorder(browser);

    const pages = new Set<import('patchright').Page>();
    const registerPage = (page: import('patchright').Page) => {
        pages.add(page);
        page.on('framenavigated', () => ensureRecordersInjected(page));
    };

    browser.on('page', registerPage);

    const page = await browser.newPage();
    registerPage(page);

    const networkRecorder = new NetworkRecorder(config);
    networkRecorder.attach(page);

    console.log(`Navigating to ${startUrl}`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await ensureRecordersInjected(page);

    console.log('\nRecording network + mouse/keyboard actions (delays, speeds, hold durations).');
    console.log('Perform your manual actions in the browser.');
    console.log('Press Enter when done to save to logs/manual-session/\n');
    await waitForEnter('Press Enter to save recording and exit...');

    const actions: import('./bot/action-recorder').RecordedAction[] = [];
    for (const p of pages) {
        try {
            if (p.isClosed()) continue;
            actions.push(...(await collectRecordedActions(p)));
        } catch (_) {}
    }
    actions.sort((a, b) => a.t - b.t);

    if (actions.length === 0) {
        console.log('[Record] No actions captured. This can happen if the site uses a cross-origin iframe.');
    }

    await networkRecorder.dump(page, {
        attempt: 0,
        actorId: 'manual',
        stepId: 'MANUAL',
        errorMessage: 'User-triggered dump',
        incidentType: 'manual',
        actions,
    });

    console.log(`[ActionRecorder] Saved ${actions.length} actions to actions.json`);
    await browser.close();
    process.exit(0);
})();
