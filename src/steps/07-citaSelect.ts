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
        // Wait for the previous page's form submit navigation to complete
        await page.waitForSelector('#btnEnviar', { state: 'hidden', timeout: SELECTOR_TIMEOUT_MS });
        await page.waitForLoadState('domcontentloaded');
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
                page.locator(CITA_POSITIVE_SELECTOR).first().waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS })
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
