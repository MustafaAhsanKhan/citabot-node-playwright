import type { Step } from './types';
import { selectRegionStep } from './00-selectRegion';
import { entrarStep } from './02-entrar';
import { personalIdStep } from './03-personalId';
import { personalIdConfirmStep } from './04-personalIdConfirm';
import { citaSelectStep } from './07-citaSelect';

// Barcelona toma-de-huellas watcher: 5 steps (spec §4). 01-tramite (merged into step 0),
// 05-office (any-office) and 06-personalContact (page not reached) are kept on disk but
// unregistered. StepId members for them stay in the enum (still referenced by the runner).
export const defaultSteps: Step[] = [
    selectRegionStep,
    entrarStep,
    personalIdStep,
    personalIdConfirmStep,
    citaSelectStep,
];

export { BotWalker } from './walker';
export * from './actions';
export * from './types';
export { waitForSelector, SELECTOR_TIMEOUT_MS } from './wait';
