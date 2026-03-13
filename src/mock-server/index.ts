/**
 * Mock server for manual integration testing.
 * Serves simple HTML forms (no scripts) so the bot can run against localhost.
 *
 * Usage:
 *   npm run mock
 *   Then set baseUrl: "http://localhost:3999" in config.json and run the bot.
 *
 * Env MOCK_PORT (default 3999), MOCK_NO_CITA=1 to serve no-cita at step 6.
 */
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { parse as parseUrl } from 'url'

const PORT = parseInt(process.env.MOCK_PORT || '3999', 10)
const MOCK_NO_CITA = process.env.MOCK_NO_CITA === '1'

const PAGES_DIR = path.join(process.cwd(), 'mock-server', 'pages')

const SESSION_COOKIE = 'mock-session'
const sessions = new Map<string, number>()

function getStep(sessionId: string): number {
    return sessions.get(sessionId) ?? 0
}

function advanceStep(sessionId: string): number {
    const step = getStep(sessionId)
    const next = Math.min(step + 1, 6)
    sessions.set(sessionId, next)
    return next
}

function parseCookie(header: string | undefined): string | null {
    if (!header) return null
    const m = header.match(/mock-session=([^;\s]+)/)
    return m ? m[1] : null
}

function getOrCreateSession(req: http.IncomingMessage, res: http.ServerResponse): string {
    const cookie = req.headers.cookie
    let id = parseCookie(cookie)
    if (!id) {
        id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${id}; Path=/`)
    }
    return id
}

function serveHtml(res: http.ServerResponse, html: string) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(html)
}

function getPageForStep(step: number): string {
    const files: Record<number, string> = {
        0: 'step0_tramite.html',
        1: 'step1_entrar.html',
        2: 'step2_nie.html',
        3: 'step3_nie2.html',
        4: 'step4_office.html',
        5: 'step5_personal.html',
        6: MOCK_NO_CITA ? 'step6_no_cita.html' : 'step6_cita.html',
    }
    return fs.readFileSync(path.join(PAGES_DIR, files[step]), 'utf-8')
}

function getRegionSelectPage(): string {
    return fs.readFileSync(path.join(PAGES_DIR, 'step_region.html'), 'utf-8')
}

const server = http.createServer((req, res) => {
    const sessionId = getOrCreateSession(req, res)
    const parsed = parseUrl(req.url || '/', true)
    const pathname = parsed.pathname || '/'
    const method = req.method || 'GET'

    if (method === 'GET' && pathname === '/icpco/citar' && !parsed.query?.p) {
        serveHtml(res, getRegionSelectPage())
        return
    }
    if (method === 'GET' && (pathname === '/icpco/citar' || pathname.startsWith('/icpco/citar'))) {
        const step = getStep(sessionId)
        const html = getPageForStep(step)
        serveHtml(res, html)
        return
    }

    if (method === 'POST' && (
        pathname === '/icpco/advance' ||
        pathname === '/icpco/salirInicio' ||
        pathname === '/icpco/acVerificarCita' ||
        pathname === '/icpco/acGrabarCita'
    )) {
        advanceStep(sessionId)
        const p = parsed.query?.p || '3'
        res.writeHead(302, { Location: `/icpco/citar?p=${p}&locale=es` })
        res.end()
        return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
})

server.listen(PORT, () => {
    console.log(`Mock server running at http://localhost:${PORT}`)
    console.log(`  GET  /icpco/citar?p=3&locale=es - serve step page`)
    console.log(`  POST /icpco/advance etc - advance step and redirect`)
    if (MOCK_NO_CITA) console.log(`  (MOCK_NO_CITA=1: serving no-cita at step 6)`)
})
