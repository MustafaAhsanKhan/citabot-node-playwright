import type { Step } from './types';
import { StepId } from './types';
import { move, click, typeChars, press, scroll, moveRandom } from './actions';

export const personalContactStep: Step = {
    id: StepId.PersonalContact,
    waitFor: '#txtTelefonoCitado',
    actions: (ctx) => {
        const telefono = ctx.config.personalData.telefono ?? '';
        const email = ctx.config.personalData.email ?? '';
        return [
            moveRandom(),
            click('#txtTelefonoCitado'),
            typeChars(telefono),
            press('Tab'),
            typeChars(email),
            press('Tab'),
            typeChars(email),
            scroll('#btnSiguiente'),
            move('#btnSiguiente'),
            click('#btnSiguiente'),
        ];
    },
};
