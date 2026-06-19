import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildTelegramUrl, buildTelegramBody, sendTelegram } from '../../notifications/telegram'
import type { AppConfig } from '../../config'

const TOKEN = '123456:SECRET-TOKEN'
const cfg = { notifications: { telegram: { botToken: TOKEN, chatId: '999' } } } as AppConfig

describe('buildTelegramUrl', () => {
    it('embeds the bot token in the sendMessage path', () => {
        assert.strictEqual(
            buildTelegramUrl(TOKEN),
            'https://api.telegram.org/bot123456:SECRET-TOKEN/sendMessage'
        )
    })
})

describe('buildTelegramBody', () => {
    it('joins title and message with a newline', () => {
        assert.deepStrictEqual(buildTelegramBody('999', 'T', 'M'), { chat_id: '999', text: 'T\nM' })
    })
})

describe('sendTelegram', () => {
    it('POSTs the correct url and body when telegram is configured', async () => {
        let calledUrl = ''
        let calledMethod = ''
        let calledBody = ''
        const fetchFn = (async (url: unknown, init: { method?: unknown; body?: unknown }) => {
            calledUrl = String(url)
            calledMethod = String(init.method)
            calledBody = String(init.body)
            return { ok: true, status: 200 } as unknown as Response
        }) as unknown as typeof fetch
        await sendTelegram(cfg, { title: 'Cita', message: 'found' }, { fetchFn })
        assert.strictEqual(calledUrl, 'https://api.telegram.org/bot123456:SECRET-TOKEN/sendMessage')
        assert.strictEqual(calledMethod, 'POST')
        assert.deepStrictEqual(JSON.parse(calledBody), { chat_id: '999', text: 'Cita\nfound' })
    })

    it('does nothing when telegram config is absent', async () => {
        let called = false
        const fetchFn = (async () => {
            called = true
            return { ok: true, status: 200 } as unknown as Response
        }) as unknown as typeof fetch
        await sendTelegram({} as AppConfig, { title: 'x', message: 'y' }, { fetchFn })
        assert.strictEqual(called, false)
    })

    it('never throws and logs status only (no token) on a failed request', async () => {
        const logs: string[] = []
        const fetchFn = (async () => ({ ok: false, status: 500 } as unknown as Response)) as unknown as typeof fetch
        await sendTelegram(cfg, { title: 'x', message: 'y' }, { fetchFn, logger: (m) => logs.push(m) })
        assert.strictEqual(logs.length, 1)
        assert.match(logs[0], /500/)
        assert.ok(!logs[0].includes(TOKEN), 'log must not contain the bot token')
    })

    it('never throws when fetch rejects, and never logs the token', async () => {
        const logs: string[] = []
        const fetchFn = (async () => { throw new Error(`connect ${TOKEN}`) }) as unknown as typeof fetch
        await sendTelegram(cfg, { title: 'x', message: 'y' }, { fetchFn, logger: (m) => logs.push(m) })
        assert.strictEqual(logs.length, 1)
        assert.ok(!logs[0].includes(TOKEN), 'log must not contain the bot token')
    })
})
