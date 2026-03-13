import type { Page } from 'patchright';
import {RetryError, BotDetectedError, RestartFromBeginning} from '../bot/errors';

export const SELECTOR_TIMEOUT_MS = 90000;

export interface WaitForOptions {
    errorTexts?: Array<{ text: string; throw: 'RetryError' | 'BotDetectedError'; payload?: unknown }>;
}

const DEFAULT_ERROR_RACES = (page: Page) => [
    page.getByText('En este momento no hay citas disponibles', { exact: false }).waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS }).then(() => {
        throw new RestartFromBeginning('No citas');
    }),
    page.getByText('The requested URL was rejected', { exact: false }).waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS }).then(() => {
        throw new BotDetectedError('Bot detected');
    }),
    page.getByText('Se ha producido un error en el sistema', { exact: false }).waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS }).then(() => {
        throw new RetryError('Se ha producido un error en el sistema', 5000);
    }),
];

export async function waitForSelector(
    page: Page,
    selector: string,
    options?: WaitForOptions
): Promise<void> {
    await Promise.race([
        page.waitForResponse((r) => {
            if (r.status() === 429) throw new RetryError('Too many requests (429)', 60000, true);
            if (r.status() === 403) throw new RetryError('Proxy forbidden (403)', 5000, true, true);
            return true;
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    const errorRaces = options?.errorTexts?.map((et) =>
        page.getByText(et.text, { exact: false }).waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS }).then(() => {
            if (et.throw === 'RetryError') throw new RetryError(et.text, 5000);
            throw new BotDetectedError(et.text);
        })
    ) ?? DEFAULT_ERROR_RACES(page);

    await Promise.race([
        page.waitForSelector(selector, { timeout: SELECTOR_TIMEOUT_MS }).then(() => true),
        ...errorRaces,
    ]);
}
