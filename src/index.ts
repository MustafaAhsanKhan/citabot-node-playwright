import { loadConfig } from './config';
import { BotRunner } from './bot/runner';
import { BotWalker, defaultSteps } from './steps';

(async () => {
    const config = loadConfig();
    const walker = new BotWalker(defaultSteps, config);
    const runner = new BotRunner(config, (page, actor, stepRef, runOptions) =>
        walker.run(page, actor, stepRef, runOptions)
    );
    await runner.run();
})();
