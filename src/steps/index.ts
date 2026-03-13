import type { Step } from './types';
import { selectRegionStep } from './00-selectRegion';
import { tramiteStep } from './01-tramite';
import { entrarStep } from './02-entrar';
import { personalIdStep } from './03-personalId';
import { personalIdConfirmStep } from './04-personalIdConfirm';
import { officeStep } from './05-office';
import { personalContactStep } from './06-personalContact';
import { citaSelectStep } from './07-citaSelect';

export const defaultSteps: Step[] = [
    selectRegionStep,
    tramiteStep,
    entrarStep,
    personalIdStep,
    personalIdConfirmStep,
    officeStep,
    personalContactStep,
    citaSelectStep,
];

export { BotWalker } from './walker';
export * from './actions';
export * from './types';
export { waitForSelector, SELECTOR_TIMEOUT_MS } from './wait';
