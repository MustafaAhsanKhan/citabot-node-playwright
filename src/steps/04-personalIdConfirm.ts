import type { Step } from './types';
import { StepId } from './types';
import { move, click, moveRandom } from './actions';

export const personalIdConfirmStep: Step = {
    id: StepId.PersonalIdConfirm,
    waitFor: '#btnEnviar',
    actions: () => [
        moveRandom(),
        move('#btnEnviar'),
        click('#btnEnviar'),
    ],
};
