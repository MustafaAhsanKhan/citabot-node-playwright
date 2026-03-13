/**
 * Integration tests: load fixture HTML and run flow steps with Patchright.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import * as fs from 'fs'
import { chromium } from 'patchright'
import { matchOffice } from '../../lib/office'
import { parseMinDate, parseCitaCandidatesFromText } from '../../lib/parsers'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')

async function loadFixture(name: string): Promise<string> {
    const p = path.join(FIXTURES, `${name}.html`)
    return fs.promises.readFile(p, 'utf-8')
}

describe('Office selection', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>

    before(async () => {
        browser = await chromium.launch({ headless: true })
    })
    after(async () => {
        await browser?.close()
    })

    it('selects office by config priority', async () => {
        const page = await browser.newPage()
        const html = await loadFixture('office')
        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        const opts = await page.$$eval('#idSede option', els =>
            els.map(o => ({ text: o.textContent ?? '', value: o.getAttribute('value') ?? '' }))
        )
        const offices = ['alcoy', 'madrid']
        const value = matchOffice(opts, offices)
        assert.ok(value)
        assert.strictEqual(value, '12')

        await page.selectOption('#idSede', value)
        const selected = await page.$eval('#idSede', (el: HTMLSelectElement) => el.value)
        assert.strictEqual(selected, '12')
        await page.close()
    })
})

describe('Personal data form', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>

    before(async () => {
        browser = await chromium.launch({ headless: true })
    })
    after(async () => {
        await browser?.close()
    })

    it('fills phone and email', async () => {
        const page = await browser.newPage()
        const html = await loadFixture('personal_data')
        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        await page.fill('#txtTelefonoCitado', '600000000')
        await page.fill('#emailUNO', 'test@example.com')
        await page.fill('#emailDOS', 'test@example.com')

        const phone = await page.$eval('#txtTelefonoCitado', (el: HTMLInputElement) => el.value)
        const email = await page.$eval('#emailUNO', (el: HTMLInputElement) => el.value)
        assert.strictEqual(phone, '600000000')
        assert.strictEqual(email, 'test@example.com')
        await page.close()
    })
})

describe('Cita selection', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>

    before(async () => {
        browser = await chromium.launch({ headless: true })
    })
    after(async () => {
        await browser?.close()
    })

    it('parses divs and selects earliest cita >= minDate', async () => {
        const page = await browser.newPage()
        const html = await loadFixture('cita_page')
        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        const citaDivs = await page.$$('div[id^="cita_"]')
        const divData = await Promise.all(
            citaDivs.map(async d => ({
                id: await d.getAttribute('id'),
                text: (await d.textContent()) ?? '',
            }))
        )
        const minDate = parseMinDate('2026-02-01')
        const candidates = parseCitaCandidatesFromText(divData, minDate)
        const selected = candidates[0]
        assert.ok(selected)
        assert.strictEqual(selected.index, 1)
        assert.strictEqual(selected.radioId, 'cita1')

        await page.click(`#${selected.radioId}`)
        const checked = await page.$eval(`#${selected.radioId}`, (el: HTMLInputElement) => el.checked)
        assert.strictEqual(checked, true)
        await page.close()
    })

    it('selects cita2 when cita1 is before minDate', async () => {
        const page = await browser.newPage()
        const html = await loadFixture('cita_page')
        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        const citaDivs = await page.$$('div[id^="cita_"]')
        const divData = await Promise.all(
            citaDivs.map(async d => ({
                id: await d.getAttribute('id'),
                text: (await d.textContent()) ?? '',
            }))
        )
        const minDate = parseMinDate('2026-02-18') // 18 Feb - cita1 (17) and cita2 (18) are on/before; cita2 is first >= 18
        const candidates = parseCitaCandidatesFromText(divData, minDate)
        const selected = candidates[0]
        assert.ok(selected)
        assert.strictEqual(selected.index, 2)
        assert.strictEqual(selected.radioId, 'cita2')
        await page.close()
    })
})

describe('No cita page', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>

    before(async () => {
        browser = await chromium.launch({ headless: true })
    })
    after(async () => {
        await browser?.close()
    })

    it('detects no-citas message', async () => {
        const page = await browser.newPage()
        const html = await loadFixture('no_cita')
        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        const noCitaVisible = await page.getByText('no hay citas disponibles', { exact: false }).isVisible()
        const citaDivs = await page.$$('div[id^="cita_"]')
        assert.strictEqual(noCitaVisible, true)
        assert.strictEqual(citaDivs.length, 0)
        await page.close()
    })
})

describe('Confirm cita page', () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>>

    before(async () => {
        browser = await chromium.launch({ headless: true })
    })
    after(async () => {
        await browser?.close()
    })

    it('has confirmation elements', async () => {
        const page = await browser.newPage()
        const html = await loadFixture('confirm_cita')
        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        const chk = await page.$('#chkTotal')
        const code = await page.$('#txtCodigoVerificacion')
        assert.ok(chk)
        assert.ok(code)

        await page.check('#chkTotal')
        await page.fill('#txtCodigoVerificacion', '123456')
        const checked = await page.$eval('#chkTotal', (el: HTMLInputElement) => el.checked)
        const codigo = await page.$eval('#txtCodigoVerificacion', (el: HTMLInputElement) => el.value)
        assert.strictEqual(checked, true)
        assert.strictEqual(codigo, '123456')
        await page.close()
    })
})
