import type { Step } from './types';
import { StepId } from './types';
import { move, click, typeChars, press, moveRandom, scroll, select } from './actions';
import type { Action } from '../bot/pipeline';
import { rand, sleep } from '../misc';

export const personalIdStep: Step = {
    id: StepId.PersonalId,
    waitFor: '#btnEnviar',
    before: async () => {
        await sleep(rand(1500, 2000));
    },
    actions: (ctx) => {
        const { nie, nombre, nacionalidad } = ctx.config.personalData;
        const pipeline: Action[] = [
            moveRandom(),
            click('#txtIdCitado'),
            typeChars(nie),
            rand(0, 100) < 50 ? press('Tab') : click('#txtDesCitado'),
            typeChars(nombre),
        ];
        if (nacionalidad) {
            pipeline.push(select('#txtPaisNac', { label: nacionalidad }));
        }
        pipeline.push(scroll('#btnEnviar'), move('#btnEnviar'), click('#btnEnviar'));
        return pipeline;
    },
};
