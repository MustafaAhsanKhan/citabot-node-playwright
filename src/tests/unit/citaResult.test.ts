import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as fs from 'fs'
import * as path from 'path'
import { classifyCitaResult } from '../../lib/parsers'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')
const load = (name: string) => fs.readFileSync(path.join(FIXTURES, `${name}.html`), 'utf-8')

describe('classifyCitaResult', () => {
    it('classifies the no-citas page as no-citas (even though it shares #btnSubmit)', () => {
        assert.strictEqual(classifyCitaResult(load('bcn_no_citas')), 'no-citas')
    })
    it('classifies the WAF reject page as waf', () => {
        assert.strictEqual(classifyCitaResult(load('bcn_waf')), 'waf')
    })
    it('classifies the citas-available page as available', () => {
        assert.strictEqual(classifyCitaResult(load('bcn_citas_available')), 'available')
    })
    it('prioritizes WAF over any other signal', () => {
        assert.strictEqual(
            classifyCitaResult('The requested URL was rejected ... name="rdbCita"'),
            'waf'
        )
    })
    it('treats an unsettled/blank page as unknown (never bare-negation success)', () => {
        assert.strictEqual(classifyCitaResult('<html><body>cargando...</body></html>'), 'unknown')
    })
})
