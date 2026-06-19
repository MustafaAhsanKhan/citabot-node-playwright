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
