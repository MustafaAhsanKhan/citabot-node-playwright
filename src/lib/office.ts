/**
 * Office matching logic - exported for testing
 */

export function matchOffice(
    options: { text: string; value: string }[],
    officeNames: string[]
): string | null {
    for (const officeName of officeNames) {
        for (const opt of options) {
            if (opt.value && opt.text.trim().toLowerCase().includes(officeName.toLowerCase())) {
                return opt.value
            }
        }
    }
    return null
}
