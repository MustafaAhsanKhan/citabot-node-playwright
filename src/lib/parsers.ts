/**
 * Date and cita parsing helpers - exported for testing
 */

/** Parse DD/MM/YYYY (Spanish format) to Date */
export function parseCitaDate(str: string): Date {
    const [d, m, y] = str.trim().split('/').map(Number)
    return new Date(y, m - 1, d)
}

/** Parse YYYY-MM-DD to Date */
export function parseMinDate(str: string): Date {
    const [y, m, d] = str.trim().split('-').map(Number)
    return new Date(y, m - 1, d)
}

export interface CitaCandidate {
    index: number
    date: Date
    radioId: string
}

/** Extract cita candidates from div text content (matches DD/MM/YYYY) */
export function parseCitaCandidatesFromText(
    divs: { id: string | null; text: string }[],
    minDate: Date
): CitaCandidate[] {
    const candidates: CitaCandidate[] = []
    for (const div of divs) {
        const match = div.id?.match(/cita_(\d+)/)
        if (!match) continue
        const index = parseInt(match[1], 10)
        const dateMatch = div.text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
        if (!dateMatch) continue
        const date = parseCitaDate(dateMatch[1])
        if (date >= minDate) {
            candidates.push({ index, date, radioId: `cita${index}` })
        }
    }
    candidates.sort((a, b) => a.date.getTime() - b.date.getTime())
    return candidates
}

/**
 * UNVERIFIED positive cita anchor (spec §5.3 / §11). The Barcelona result/slot page was never
 * reached during mapping (WAF blocked it). The real-site dry run (spec §10.8) MUST confirm this
 * before the watcher is trusted. The CSS selector (live settle-race in 07-citaSelect) and the HTML
 * token (classifyCitaResult below) derive from one constant — change CITA_POSITIVE_TOKEN when the
 * real anchor is confirmed and both stay in sync.
 */
export const CITA_POSITIVE_TOKEN = 'name="rdbCita"'
export const CITA_POSITIVE_SELECTOR = `input[${CITA_POSITIVE_TOKEN}]`

export type CitaResult = 'no-citas' | 'waf' | 'available' | 'unknown'

/**
 * Classify a *settled* cita result page from its serialized HTML. Priority: WAF, then no-citas,
 * then a positive anchor. Success ('available') requires the no-citas message ABSENT *and* a known
 * result-page element present — never bare absence-of-negative (spec §5).
 */
export function classifyCitaResult(html: string): CitaResult {
    if (html.includes('The requested URL was rejected')) return 'waf'
    if (html.includes('En este momento no hay citas disponibles')) return 'no-citas'
    if (html.includes(CITA_POSITIVE_TOKEN)) return 'available'
    return 'unknown'
}
