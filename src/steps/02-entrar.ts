import type { Step } from './types';
import { StepId } from './types';
import { move, click, scroll, moveRandom } from './actions';

export const entrarStep: Step = {
    id: StepId.Entrar,
    waitFor: '#btnEntrar',
    actions: () => [
        moveRandom(),
        scroll('#btnEntrar'),
        move('#btnEntrar'),
        click('#btnEntrar'),
    ],
};
