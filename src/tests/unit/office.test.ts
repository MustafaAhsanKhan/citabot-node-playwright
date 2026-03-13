import { describe, it } from 'node:test'
import assert from 'node:assert'
import { matchOffice } from '../../lib/office'

describe('matchOffice', () => {
    it('returns first matching office by priority', () => {
        const options = [
            { text: 'CNP Madrid, Calle X', value: '10' },
            { text: 'CNP Alcoy, Placeta Les Xiques, S/N, Alcoy', value: '12' },
        ]
        const offices = ['alcoy', 'madrid']
        const value = matchOffice(options, offices)
        assert.strictEqual(value, '12')
    })
    it('returns null when no match', () => {
        const options = [
            { text: 'CNP Madrid', value: '10' },
        ]
        const offices = ['barcelona', 'valencia']
        const value = matchOffice(options, offices)
        assert.strictEqual(value, null)
    })
    it('ignores options with empty value', () => {
        const options = [
            { text: 'Seleccione...', value: '' },
            { text: 'CNP Alcoy', value: '12' },
        ]
        const offices = ['alcoy']
        const value = matchOffice(options, offices)
        assert.strictEqual(value, '12')
    })
    it('is case insensitive', () => {
        const options = [{ text: 'CNP ALCoy Office', value: '12' }]
        const value = matchOffice(options, ['ALCOY'])
        assert.strictEqual(value, '12')
    })
})
