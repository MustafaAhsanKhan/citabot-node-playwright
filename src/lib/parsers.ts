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
