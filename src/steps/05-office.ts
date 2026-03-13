import * as path from 'path';
import * as fs from 'fs';
import type { Step } from './types';
import { StepId, StepDataKey } from './types';
import { move, click, scroll, select, moveRandom } from './actions';
import { matchOffice } from '../lib/office';

export const officeStep: Step = {
    id: StepId.Office,
    waitFor: '#idSede',
    before: async (ctx) => {
        const officeOptions = await ctx.page.$$('#idSede option');
        const opts = await Promise.all(
            officeOptions.map(async (o) => ({
                text: (await o.textContent()) ?? '',
                value: (await o.getAttribute('value')) ?? '',
            }))
        );
        const matchedValue = matchOffice(opts, ctx.config.offices);
        const realOffices = opts.filter((o) => o.value);
        console.log(
            `[${StepId.Office}] Found ${opts.length} options (${realOffices.length} with value), matched: ${matchedValue ?? 'none'} (config: ${ctx.config.offices.join(', ')})`
        );
        if (!matchedValue) {
            const logsDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const prefix = path.join(logsDir, `no-office-match-${timestamp}`);
            const htmlPath = `${prefix}.html`;
            const jsonPath = `${prefix}.json`;
            const html = await ctx.page.content();
            fs.writeFileSync(htmlPath, html, 'utf-8');
            fs.writeFileSync(
                jsonPath,
                JSON.stringify(
                    {
                        timestamp: new Date().toISOString(),
                        configOffices: ctx.config.offices,
                        availableOptions: opts,
                        realOfficeCount: realOffices.length,
                    },
                    null,
                    2
                ),
                'utf-8'
            );
            console.log(
                `No office matched config.offices: ${ctx.config.offices.join('; ')}. Saved page to ${htmlPath}, office list to ${jsonPath}`
            );
            throw new Error(`No office matched config.offices: ${ctx.config.offices.join('; ')}`);
        }
        ctx.data[StepDataKey.MatchedOffice] = matchedValue;
    },
    actions: (ctx) => {
        const matchedValue = ctx.data[StepDataKey.MatchedOffice] as string;
        return [
            moveRandom(),
            move('#idSede'),
            select('#idSede', { value: matchedValue }),
            scroll('#btnSiguiente'),
            move('#btnSiguiente'),
            click('#btnSiguiente'),
        ];
    },
};
