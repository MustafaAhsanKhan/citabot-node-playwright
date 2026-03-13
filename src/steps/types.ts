import type { Action } from '../bot/pipeline';
import type { AppConfig } from '../config';
import type { Page } from 'patchright';
import type { HumanCursor } from '../bot/cursor';
import type { HumanKeyboard } from '../bot/keyboard';
import type { PagePipeline } from '../bot/pipeline';

export enum StepId {
    RegionSelect = 'REGION_SELECT',
    Tramite = 'TRAMITE',
    Entrar = 'ENTRAR',
    PersonalId = 'PERSONAL_ID',
    PersonalIdConfirm = 'PERSONAL_ID_CONFIRM',
    Office = 'OFFICE',
    PersonalContact = 'PERSONAL_CONTACT',
    CitaSelect = 'CITA_SELECT',
}

export enum RunResult {
    RecoveryNeeded = 'RECOVERY_NEEDED',
}

export enum ErrorThrowType {
    RetryError = 'RetryError',
    BotDetectedError = 'BotDetectedError',
}

/** Known keys for ctx.data shared between steps */
export enum StepDataKey {
    CookieBannerVisible = 'cookieBannerVisible',
    MatchedOffice = 'matchedOffice',
}

export interface RunOptions {
    /** Probability (0–1) of random mouse movement between pipeline actions */
    randomMoveProbability?: number;
    pagePreloaded?: boolean;
}

export interface StepContext {
    config: AppConfig;
    page: Page;
    cursor: HumanCursor;
    keyboard: HumanKeyboard;
    pipeline: PagePipeline;
    runOptions?: RunOptions;
    /** Extra data set by step hooks. Use StepDataKey for known keys. */
    data: Partial<Record<StepDataKey, unknown>>;
}

export interface Step {
    id: StepId;
    /** Selector to wait for before running. If absent, step.before handles navigation/wait (e.g. tramite) */
    waitFor?: string;
    waitForOptions?: { errorTexts?: Array<{ text: string; throw: ErrorThrowType; payload?: unknown }> };
    /** Runs before actions (e.g. cookie banner check, office matching). Can mutate ctx.data */
    before?: (ctx: StepContext) => Promise<void>;
    /** Actions receive context for config-driven values */
    actions: (ctx: StepContext) => Action[];
    /** Runs after actions for custom logic (e.g. cita parsing). Return value becomes step output. */
    after?: (ctx: StepContext) => Promise<unknown>;
}
