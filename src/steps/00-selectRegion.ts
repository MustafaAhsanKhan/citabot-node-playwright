import {Step, StepDataKey} from './types';
import type { Action } from '../bot/pipeline';
import { StepId } from './types';
import {move, click, label, select} from './actions';
import { RetryError } from '../bot/errors';
import {rand, sleep} from "../misc";

const REGION_SELECT_PATH = '/icpco/citar';

export const selectRegionStep: Step = {
    id: StepId.RegionSelect,
    waitFor: undefined, // before handles navigation + wait
    before: async (ctx) => {
        const base = ctx.config.baseUrl ?? 'https://icp.administracionelectronica.gob.es';
        const url = `${base}${REGION_SELECT_PATH}`;
        console.log(`[${StepId.RegionSelect}] Navigating to ${url}`);
        const gotoRes = await ctx.page.goto(url);
        if (gotoRes?.status() === 403) throw new RetryError('Proxy forbidden (403)', 5000, true, true);
        await ctx.page.waitForSelector('#btnAceptar', { timeout: 90000 });
        const visible = await ctx.page.locator('#cookie_action_close_header').first()
            .isVisible({ timeout: 2000 }).catch(() => false);
        ctx.data[StepDataKey.CookieBannerVisible] = visible;
        console.log(`[${StepId.Tramite}] Cookie banner ${visible ? 'visible, will dismiss' : 'not visible'}`);
        await sleep(rand(1500, 2000));
    },
    actions: (ctx) => {
        const pipeline = [
            select('#form', { label: ctx.config.location }),
            move('#btnAceptar'),
            click('#btnAceptar'),
        ]
        if (ctx.data[StepDataKey.CookieBannerVisible]) {
            const cookieClick = label(
                (({ page }) => page.locator('#cookie_action_close_header').first().click({ timeout: 3000 })) as Action,
                'click(#cookie_action_close_header)'
            );
            pipeline.unshift(cookieClick);
        }

        return pipeline;
    },
};
