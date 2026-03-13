import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseCitaDate, parseMinDate, parseCitaCandidatesFromText } from '../../lib/parsers'

describe('parseCitaDate', () => {
    it('parses DD/MM/YYYY', () => {
        const d = parseCitaDate('17/02/2026')
        assert.strictEqual(d.getFullYear(), 2026)
        assert.strictEqual(d.getMonth(), 1)
        assert.strictEqual(d.getDate(), 17)
    })
    it('trims whitespace', () => {
        const d = parseCitaDate('  19/03/2025  ')
        assert.strictEqual(d.getDate(), 19)
        assert.strictEqual(d.getMonth(), 2)
    })
})

describe('parseMinDate', () => {
    it('parses YYYY-MM-DD', () => {
        const d = parseMinDate('2026-02-01')
        assert.strictEqual(d.getFullYear(), 2026)
        assert.strictEqual(d.getMonth(), 1)
        assert.strictEqual(d.getDate(), 1)
    })
    it('trims whitespace', () => {
        const d = parseMinDate('  2025-12-31  ')
        assert.strictEqual(d.getMonth(), 11)
        assert.strictEqual(d.getDate(), 31)
    })
})

describe('parseCitaCandidatesFromText', () => {
    it('extracts and sorts candidates by date', () => {
        const divs = [
            { id: 'cita_2', text: 'CITA 2 Día: 18/02/2026 Hora: 09:30' },
            { id: 'cita_1', text: 'CITA 1 Día: 17/02/2026 Hora: 09:50' },
            { id: 'cita_3', text: 'CITA 3 Día: 19/02/2026 Hora: 09:30' },
        ]
        const minDate = new Date(2026, 0, 15) // 15 Jan 2026
        const candidates = parseCitaCandidatesFromText(divs, minDate)
        assert.strictEqual(candidates.length, 3)
        assert.strictEqual(candidates[0].index, 1)
        assert.strictEqual(candidates[0].radioId, 'cita1')
        assert.strictEqual(candidates[1].index, 2)
        assert.strictEqual(candidates[2].index, 3)
    })
    it('filters dates before minDate', () => {
        const divs = [
            { id: 'cita_1', text: 'Día: 10/02/2026' },
            { id: 'cita_2', text: 'Día: 20/02/2026' },
        ]
        const minDate = new Date(2026, 1, 15) // 15 Feb 2026
        const candidates = parseCitaCandidatesFromText(divs, minDate)
        assert.strictEqual(candidates.length, 1)
        assert.strictEqual(candidates[0].index, 2)
    })
    it('ignores divs without cita_ pattern', () => {
        const divs = [
            { id: 'other_1', text: 'Día: 17/02/2026' },
            { id: 'cita_1', text: 'Día: 17/02/2026' },
        ]
        const minDate = new Date(2026, 0, 1)
        const candidates = parseCitaCandidatesFromText(divs, minDate)
        assert.strictEqual(candidates.length, 1)
        assert.strictEqual(candidates[0].index, 1)
    })
})
