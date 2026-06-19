/**
 * Integration tests for the Barcelona watcher: drive fixture HTML with Patchright.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import * as fs from 'fs'
import { chromium } from 'patchright'
import { classifyCitaResult, type CitaResult } from '../../lib/parsers'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')

async function loadFixture(name: string): Promise<string> {
    return fs.promises.readFile(path.join(FIXTURES, `${name}.html`), 'utf-8')
}

const TRAMITE_LABEL =
    'POLICÍA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013'

describe('Combined office + tramite page', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>
    before(async () => { browser = await chromium.launch({ headless: true }) })
    after(async () => { await browser?.close() })

    it('selecting Cualquier oficina populates tramiteGrupo[0] and the tramite is selectable', async () => {
        const page = await browser.newPage()
        await page.setContent(await loadFixture('bcn_combined'), { waitUntil: 'domcontentloaded' })

        await page.selectOption('#sede', { value: '99' })
        // An <option> in a closed <select> has an empty bounding box, so it is never 'visible' to
        // Playwright — a default waitForSelector would hang to timeout. Wait for the target option
        // (matched by label, not position) to be ATTACHED to the DOM.
        await page
            .locator('#tramiteGrupo\\[0\\]')
            .locator('option', { hasText: TRAMITE_LABEL })
            .waitFor({ state: 'attached', timeout: 5000 })
        await page.selectOption('#tramiteGrupo\\[0\\]', { label: TRAMITE_LABEL })

        const value = await page.$eval('#tramiteGrupo\\[0\\]', (el: HTMLSelectElement) => el.value)
        assert.strictEqual(value, '1')
        await page.close()
    })
})

describe('Cita result classification (browser-serialized HTML)', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>
    before(async () => { browser = await chromium.launch({ headless: true }) })
    after(async () => { await browser?.close() })

    const cases: [string, CitaResult][] = [
        ['bcn_no_citas', 'no-citas'],
        ['bcn_waf', 'waf'],
        ['bcn_citas_available', 'available'],
    ]
    for (const [fixture, expected] of cases) {
        it(`classifies ${fixture} as ${expected} after the browser serializes it`, async () => {
            const page = await browser.newPage()
            await page.setContent(await loadFixture(fixture), { waitUntil: 'domcontentloaded' })
            assert.strictEqual(classifyCitaResult(await page.content()), expected)
            await page.close()
        })
    }
})
