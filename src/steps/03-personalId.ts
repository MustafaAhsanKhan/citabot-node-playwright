import type {Step} from './types';
import {StepId} from './types';
import {move, click, typeChars, press, moveRandom, scroll} from './actions';
import {rand, sleep} from "../misc";

export const personalIdStep: Step = {
    id: StepId.PersonalId,
    waitFor: '#btnEnviar',
    before: async () => {
        await sleep(rand(1500, 2000));
    },
    actions: (ctx) => {
        const {nie, nombre} = ctx.config.personalData;
        return [
            moveRandom(),
            click('#txtIdCitado'),
            typeChars(nie),
            rand(0, 100) < 50 ? press('Tab') : click('#txtNombre'),
            typeChars(nombre),
            scroll('#btnEnviar'),
            move('#btnEnviar'),
            click('#btnEnviar'),
        ];
    },
};
