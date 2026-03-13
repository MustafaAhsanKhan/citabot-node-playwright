import * as path from 'path';
import * as fs from 'fs';
import type { Step } from './types';
import { StepId } from './types';
import {RestartFromBeginning, RetryError} from '../bot/errors';
import { RunResult } from './types';
import { SELECTOR_TIMEOUT_MS } from './wait';
import { parseMinDate, parseCitaCandidatesFromText } from '../lib/parsers';
import { notifyRecoveryNeeded } from '../notifications';
import {click, move} from "./actions";

export const citaSelectStep: Step = {
    id: StepId.CitaSelect,
    waitFor: undefined,
    before: async (ctx) => {
        console.log(`[${StepId.CitaSelect}] Waiting for cita slots or no-citas message...`);
        const noCitasLocator = ctx.page.getByText('En este momento no hay citas disponibles', { exact: false });
        const hasNoCitas = await Promise.race([
            ctx.page.waitForSelector('[id^="cita_"]', { timeout: SELECTOR_TIMEOUT_MS }).then(() => false),
            noCitasLocator.waitFor({ state: 'visible' }).then(() => true),
        ]);
        if (hasNoCitas) {
            console.log(`[${StepId.CitaSelect}] No citas`);
            throw new RestartFromBeginning('No citas');
        }
    },
    actions: () => [],
    after: async (ctx) => {
        try {
            const citaDivs = await ctx.page.$$('div[id^="cita_"]');
            const divData = await Promise.all(
                citaDivs.map(async (d) => ({
                    id: await d.getAttribute('id'),
                    text: (await d.textContent()) ?? '',
                }))
            );
            const minDate = parseMinDate(ctx.config.minCitaDate);
            const candidates = parseCitaCandidatesFromText(divData, minDate);
            const selectedCita = candidates[0];
            console.log(
                `[${StepId.CitaSelect}] Found ${candidates.length} candidate(s), selected: ${selectedCita ? `${selectedCita.date.toLocaleDateString('es-ES')} slot ${selectedCita.index}` : 'none'}`
            );
            if (!selectedCita) {
                const { NoSuitableCitaError } = await import('../bot/errors');
                const logsDir = path.join(process.cwd(), 'logs');
                if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const htmlPath = path.join(logsDir, `no-cita-${timestamp}.html`);
                const html = await ctx.page.content();
                fs.writeFileSync(htmlPath, html, 'utf-8');
                console.log(`No suitable cita (min: ${ctx.config.minCitaDate}). Saved page to ${htmlPath}`);
                throw new NoSuitableCitaError(htmlPath);
            }

            return `${selectedCita.date.toLocaleDateString('es-ES')} (slot ${selectedCita.index})`;
        } catch (e) {
            const { RetryError, BotDetectedError, NoSuitableCitaError } = await import('../bot/errors');
            if (e instanceof RetryError || e instanceof BotDetectedError || e instanceof NoSuitableCitaError) throw e;
            await notifyRecoveryNeeded(ctx.config);
            return RunResult.RecoveryNeeded;
        }
    },
};
