import { rand } from '../misc';
import type { AppConfig } from '../config';

export const DEFAULT_POLL_MS = 5000;
export const WAF_BACKOFF_MIN_MS = 5 * 60 * 1000; // 5 min
export const WAF_BACKOFF_MAX_MS = 10 * 60 * 1000; // 10 min

/** Randomized poll backoff in ms from config.pollDelaySeconds (seconds), falling back to 5000ms when unset. */
export function pollSleepMs(
    config: Pick<AppConfig, 'pollDelaySeconds'>,
    randFn: (min: number, max: number) => number = rand
): number {
    const t = config.pollDelaySeconds;
    if (t && t.length === 2) return randFn(t[0], t[1]) * 1000;
    return DEFAULT_POLL_MS;
}

/** Randomized long WAF cool-down in ms (5–10 min). */
export function wafBackoffMs(randFn: (min: number, max: number) => number = rand): number {
    return randFn(WAF_BACKOFF_MIN_MS, WAF_BACKOFF_MAX_MS);
}
