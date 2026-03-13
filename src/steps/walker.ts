import type { Page } from 'patchright';
import type { Step, StepContext } from './types';
import type { StepId } from './types';
import { RunResult } from './types';
import type { AppConfig, ActorConfig } from '../config';
import { HumanCursor } from '../bot/cursor';
import { HumanKeyboard } from '../bot/keyboard';
import { PagePipeline } from '../bot/pipeline';
import { waitForSelector } from './wait';
import {rand, sleep} from "../misc";

export class BotWalker {
    constructor(
        public readonly steps: Step[],
        private readonly config: AppConfig
    ) {}

    async run(
        page: Page,
        actor?: ActorConfig,
        stepRef?: { current: StepId },
        runOptions?: { randomMoveProbability?: number, pagePreloaded?: boolean }
    ): Promise<string | RunResult> {
        const cursor = new HumanCursor(page, actor);
        const keyboard = new HumanKeyboard(page, actor);
        const pipeline = new PagePipeline(page, cursor, keyboard, actor);
        const ctx: StepContext = {
            config: this.config,
            page,
            cursor,
            keyboard,
            pipeline,
            runOptions,
            data: {},
        };

        for (const step of this.steps) {
            if (stepRef) stepRef.current = step.id;
            console.log(`[${step.id}] Starting...`);
            if (step.waitFor) {
                console.log(`[${step.id}] Waiting for selector: ${step.waitFor}`);
                await waitForSelector(page, step.waitFor, step.waitForOptions);
            }
            if (step.before) {
                await step.before(ctx);
            } else {
                await sleep(rand(1500, 2000));
            }
            const actions = step.actions(ctx);
            console.log(`[${step.id}] Executing ${actions.length} actions`);
            await pipeline.execute(actions, {
                randomMoveProbability: runOptions?.randomMoveProbability,
            });
            if (step.after) {
                const result = await step.after(ctx);
                if (result !== undefined) {
                    console.log(`[${step.id}] Completed with result: ${result}`);
                    return result as string | RunResult;
                }
            }
            console.log(`[${step.id}] Completed`);
        }
        return RunResult.RecoveryNeeded;
    }
}
