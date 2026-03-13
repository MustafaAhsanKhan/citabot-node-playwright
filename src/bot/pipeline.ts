/**
 * Human-like action pipeline executor
 * Executes a series of actions with randomized delays to simulate natural user behavior
 */
import { rand, sleep } from "../misc";
import { Page } from "patchright";
import { HumanCursor } from "./cursor";
import { HumanKeyboard } from "./keyboard";
import type { ActorConfig } from "../config";

interface ActionArgs {
    page: Page;
    cursor: HumanCursor;
    keyboard: HumanKeyboard;
}

export type Action = ((args: ActionArgs) => Promise<any>) & { label?: string };

interface PipelineConfig {
    delayBetweenActions?: [number, number];
    delayBeforeFirstAction?: [number, number];
    delayBeforeLastAction?: [number, number];
}

export interface ExecuteOptions {
    overrideConfig?: PipelineConfig;
    /** Probability (0–1) of random mouse movement between actions. Default 0.02 */
    randomMoveProbability?: number;
}

export class PagePipeline {
    private readonly config: PipelineConfig;

    constructor(
        private readonly page: Page,
        private readonly cursor: HumanCursor,
        private readonly keyboard: HumanKeyboard,
        config?: PipelineConfig | ActorConfig
    ) {
        const actorPipeline = config && typeof config === 'object' && 'id' in config ? (config as ActorConfig).pipeline : undefined;
        this.config = {
            delayBetweenActions: actorPipeline?.delayBetweenActions ?? [800, 1500],
            delayBeforeFirstAction: actorPipeline?.delayBeforeFirstAction ?? [500, 1000],
            delayBeforeLastAction: actorPipeline?.delayBeforeLastAction ?? [500, 600],
            ...(config && typeof config === 'object' && !('id' in config) ? config as PipelineConfig : {}),
        };
    }

    public async execute(actions: Action[], options?: ExecuteOptions): Promise<any> {
        const overrideConfig = options?.overrideConfig;
        const randomMoveProbability = options?.randomMoveProbability ?? 0.02;
        const cfg = { ...this.config, ...(overrideConfig || {}) };
        const delayBetween = cfg.delayBetweenActions ?? [800, 1500];
        const delayBeforeFirst = cfg.delayBeforeFirstAction ?? [500, 1000];
        const delayBeforeLast = cfg.delayBeforeLastAction ?? [10, 50];

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];

            let delay: number = 0;
            switch (i) {
                case 0:
                    delay = rand(delayBeforeFirst![0], delayBeforeFirst![1]);
                    break;
                case actions.length - 1:
                    delay = rand(delayBeforeLast![0], delayBeforeLast![1]);
                    break;
                default:
                    delay = rand(delayBetween![0], delayBetween![1]);
                    break;
            }

            await sleep(delay);

            const prob = typeof randomMoveProbability === 'number' ? randomMoveProbability : 0.02;
            if (prob > 0 && Math.random() < prob) {
                console.log(`  [Action ${i + 1}/${actions.length}] moveRandom()`);
                await this.cursor.moveRandom();
            }

            const label = (action as Action).label ?? `action ${i + 1}`;
            console.log(`  [Action ${i + 1}/${actions.length}] ${label}`);
            await action({ page: this.page, cursor: this.cursor, keyboard: this.keyboard });
        }
    }
}
