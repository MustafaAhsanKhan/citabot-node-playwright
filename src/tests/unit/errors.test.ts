import { describe, it } from 'node:test'
import assert from 'node:assert'
import { WafBackoffError } from '../../bot/errors'

describe('WafBackoffError', () => {
    it('is an Error with the WafBackoffError name and a default message', () => {
        const e = new WafBackoffError()
        assert.ok(e instanceof Error)
        assert.strictEqual(e.name, 'WafBackoffError')
        assert.strictEqual(e.message, 'WAF rejected request')
    })
    it('accepts a custom message', () => {
        assert.strictEqual(new WafBackoffError('boom').message, 'boom')
    })
})
