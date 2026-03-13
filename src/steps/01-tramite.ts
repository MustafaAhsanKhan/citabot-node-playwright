import type { Step } from './types';
import type { Action } from '../bot/pipeline';
import { StepId, StepDataKey } from './types';
import { move, click, scroll, select, label } from './actions';
import { sleep, rand } from '../misc';

export const tramiteStep: Step = {
    id: StepId.Tramite,
    waitFor: '#btnAceptar', // arrive from region selection
    before: async (ctx) => {
        await sleep(rand(1500, 2000));
    },
    actions: (ctx) => {
        const sel = '#tramiteGrupo\\[1\\]';
        return [
            move(sel),
            select(sel, { label: ctx.config.tramiteLabel }),
            scroll('#btnAceptar'),
            move('#btnAceptar'),
            click('#btnAceptar'),
        ];
    },
};
