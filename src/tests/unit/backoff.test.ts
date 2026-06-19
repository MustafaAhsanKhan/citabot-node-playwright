import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
    pollSleepMs,
    wafBackoffMs,
    DEFAULT_POLL_MS,
    WAF_BACKOFF_MIN_MS,
    WAF_BACKOFF_MAX_MS,
} from '../../bot/backoff'
import type { AppConfig } from '../../config'

describe('pollSleepMs', () => {
    it('returns the default 5000ms when pollDelaySeconds is unset', () => {
        assert.strictEqual(pollSleepMs({} as AppConfig), DEFAULT_POLL_MS)
    })
    it('draws from [min,max] seconds and converts to ms', () => {
        const cfg = { pollDelaySeconds: [45, 90] } as AppConfig
        const stub = (min: number, max: number) => {
            assert.strictEqual(min, 45)
            assert.strictEqual(max, 90)
            return 60
        }
        assert.strictEqual(pollSleepMs(cfg, stub), 60000)
    })
    it('falls back when the tuple is malformed', () => {
        const cfg = { pollDelaySeconds: [10] as unknown as [number, number] } as AppConfig
        assert.strictEqual(pollSleepMs(cfg), DEFAULT_POLL_MS)
    })
})

describe('wafBackoffMs', () => {
    it('draws between the 5 and 10 minute bounds', () => {
        const stub = (min: number, max: number) => {
            assert.strictEqual(min, WAF_BACKOFF_MIN_MS)
            assert.strictEqual(max, WAF_BACKOFF_MAX_MS)
            return min
        }
        assert.strictEqual(wafBackoffMs(stub), WAF_BACKOFF_MIN_MS)
        assert.strictEqual(WAF_BACKOFF_MIN_MS, 5 * 60 * 1000)
        assert.strictEqual(WAF_BACKOFF_MAX_MS, 10 * 60 * 1000)
    })
})
