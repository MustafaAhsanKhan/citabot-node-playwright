/**
 * Mock server for manual integration testing of the Barcelona toma-de-huellas watcher.
 * Serves the 5-step flow so `npm run mock:bot` exercises it offline.
 *
 * Usage:
 *   npm run mock      (then set baseUrl: "http://localhost:3999" in config.json and run the bot)
 *   npm run mock:bot  (starts server + bot together)
 *
 * Env: MOCK_PORT (default 3999), MOCK_NO_CITA=1 serves the "no citas" page at the result step.
 */
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { parse as parseUrl } from 'url'

const PORT = parseInt(process.env.MOCK_PORT || '3999', 10)
const MOCK_NO_CITA = process.env.MOCK_NO_CITA === '1'

const PAGES_DIR = path.join(process.cwd(), 'mock-server', 'pages')

const SESSION_COOKIE = 'mock-session'
const LAST_STEP = 4
const sessions = new Map<string, number>()

function getStep(sessionId: string): number {
    return sessions.get(sessionId) ?? 0
}

function advanceStep(sessionId: string): number {
    const next = Math.min(getStep(sessionId) + 1, LAST_STEP)
    sessions.set(sessionId, next)
    return next
}

function parseCookie(header: string | undefined): string | null {
    if (!header) return null
    const m = header.match(/mock-session=([^;\s]+)/)
    return m ? m[1] : null
}

function getOrCreateSession(req: http.IncomingMessage, res: http.ServerResponse): string {
    let id = parseCookie(req.headers.cookie)
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

/** Read the page file for a step, or null on an unknown step / missing file (so the handler can 500 instead of crashing). */
function pageForStep(step: number): string | null {
    const files: Record<number, string> = {
        0: 'bcn_combined.html',
        1: 'bcn_entrar.html',
        2: 'bcn_nie.html',
        3: 'bcn_confirm.html',
        4: MOCK_NO_CITA ? 'bcn_no_citas.html' : 'bcn_citas_available.html',
    }
    const file = files[step]
    if (!file) return null
    try {
        return fs.readFileSync(path.join(PAGES_DIR, file), 'utf-8')
    } catch {
        return null
    }
}

function serveStep(res: http.ServerResponse, step: number) {
    const html = pageForStep(step)
    if (html === null) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(`Mock server: no page available for step ${step}`)
        return
    }
    serveHtml(res, html)
}

const server = http.createServer((req, res) => {
    const sessionId = getOrCreateSession(req, res)
    const parsed = parseUrl(req.url || '/', true)
    const pathname = parsed.pathname || '/'
    const method = req.method || 'GET'

    // Entry GET (the bot's page.goto on every (re)start) resets the flow to step 0.
    if (method === 'GET' && pathname === '/icpplustieb/citar') {
        sessions.set(sessionId, 0)
        serveStep(res, 0)
        return
    }

    // Forward navigation after a form POST: advance one step, redirect to the (non-resetting) page GET.
    if (method === 'POST' && pathname === '/icpplustieb/advance') {
        advanceStep(sessionId)
        res.writeHead(302, { Location: '/icpplustieb/page' })
        res.end()
        return
    }
    if (method === 'GET' && pathname === '/icpplustieb/page') {
        serveStep(res, getStep(sessionId))
        return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
})

server.listen(PORT, () => {
    console.log(`Mock server (Barcelona watcher) running at http://localhost:${PORT}`)
    console.log(`  GET  /icpplustieb/citar   - reset + serve combined office/tramite page (step 0)`)
    console.log(`  POST /icpplustieb/advance - advance step, redirect to /icpplustieb/page`)
    console.log(`  GET  /icpplustieb/page    - serve current step page`)
    if (MOCK_NO_CITA) console.log(`  (MOCK_NO_CITA=1: serving no-citas at the result step)`)
})
