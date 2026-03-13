/**
 * Injects event listeners into the page to record mouse and keyboard actions with timestamps.
 * Used for manual recording to capture delays, speeds, and key/mouse hold durations.
 */
import type { Page, BrowserContext } from 'patchright';

export interface RecordedAction {
    t: number;
    type: 'mousedown' | 'mouseup' | 'mousemove' | 'keydown' | 'keyup' | 'wheel' | 'copy' | 'paste' | 'cut';
    /** Key codes held during this event (e.g. ['ControlLeft','KeyV']) */
    keysDown?: string[];
    /** Modifier keys held during this event */
    modifiers?: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
    delayMs?: number;
    /** For mouseup/keyup: hold duration in ms */
    durationMs?: number;
    /** For mousemove: movement speed in px/ms (enriched on save) */
    speedPxPerMs?: number;
    x?: number;
    y?: number;
    button?: number;
    key?: string;
    code?: string;
    deltaX?: number;
    deltaY?: number;
    deltaZ?: number;
    /** For copy/paste/cut: character count of clipboard data */
    textLength?: number;
}

const ACTION_RECORDING_SCRIPT = `
(function() {
    const actions = [];
    const sessionStart = Date.now();
    let lastMouseDown = {};
    let lastKeyDown = {};
    const keysDown = new Set();

    function getModifiers() {
        const ctrl = keysDown.has('ControlLeft') || keysDown.has('ControlRight');
        const shift = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight');
        const alt = keysDown.has('AltLeft') || keysDown.has('AltRight');
        const meta = keysDown.has('MetaLeft') || keysDown.has('MetaRight');
        return { shift, ctrl, alt, meta };
    }

    function push(type, extra) {
        if (type === 'keydown' && extra.code !== undefined) keysDown.add(extra.code);
        const t = Date.now() - sessionStart;
        const keysDownArr = keysDown.size > 0 ? [...keysDown].sort() : undefined;
        const mods = keysDown.size > 0 ? getModifiers() : undefined;
        let rec = { t, type, ...(keysDownArr && { keysDown: keysDownArr }), ...(mods && { modifiers: mods }), ...extra };

        if (type === 'mouseup' && extra.button !== undefined && lastMouseDown[extra.button] !== undefined) {
            rec.durationMs = t - lastMouseDown[extra.button];
        }
        if (type === 'keyup' && extra.code !== undefined && lastKeyDown[extra.code] !== undefined) {
            rec.durationMs = t - lastKeyDown[extra.code];
        }
        if (actions.length > 0) {
            rec.delayMs = t - actions[actions.length - 1].t;
        }

        actions.push(rec);

        if (type === 'mousedown' && extra.button !== undefined) {
            lastMouseDown[extra.button] = t;
        }
        if (type === 'keydown' && extra.code !== undefined) lastKeyDown[extra.code] = t;
        if (type === 'keyup' && extra.code !== undefined) keysDown.delete(extra.code);
    }

    const doc = document;
    doc.addEventListener('mousedown', e => push('mousedown', { x: e.clientX, y: e.clientY, button: e.button }), true);
    doc.addEventListener('mouseup', e => push('mouseup', { x: e.clientX, y: e.clientY, button: e.button }), true);
    doc.addEventListener('mousemove', e => push('mousemove', { x: e.clientX, y: e.clientY }), true);
    doc.addEventListener('keydown', e => push('keydown', { key: e.key, code: e.code }), true);
    doc.addEventListener('keyup', e => push('keyup', { key: e.key, code: e.code }), true);
    doc.addEventListener('wheel', e => push('wheel', { x: e.clientX, y: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ }), true);

    function onClipboard(type, e) {
        let textLength = 0;
        try {
            const data = type === 'paste'
                ? (e.clipboardData?.getData('text/plain') || '')
                : (document.getSelection()?.toString() || '');
            textLength = data.length;
        } catch (_) {}
        push(type, { textLength });
    }
    doc.addEventListener('copy', e => onClipboard('copy', e), true);
    doc.addEventListener('paste', e => onClipboard('paste', e), true);
    doc.addEventListener('cut', e => onClipboard('cut', e), true);

    window.__manualRecordingActions = actions;
})();
`;

export async function installActionRecorder(contextOrPage: BrowserContext | Page): Promise<void> {
    await contextOrPage.addInitScript(ACTION_RECORDING_SCRIPT);
}

export function getActionRecorderScript(): string {
    return ACTION_RECORDING_SCRIPT;
}

export async function ensureRecordersInjected(page: Page): Promise<void> {
    const actionScript = getActionRecorderScript();
    for (const frame of page.frames()) {
        try {
            await frame.evaluate(
                (script) => {
                    if ((window as unknown as { __manualRecordingActions?: unknown }).__manualRecordingActions)
                        return;
                    try {
                        eval(script);
                    } catch (_) {}
                },
                actionScript
            );
        } catch {
            // Cross-origin frame, skip
        }
    }
}

export async function collectRecordedActions(page: Page): Promise<RecordedAction[]> {
    const all: RecordedAction[] = [];
    const frames = page.frames();
    const seen = new Set<string>();
    for (const frame of frames) {
        if (seen.has(frame.url())) continue;
        seen.add(frame.url());
        try {
            const actions = await frame.evaluate(() => {
                const arr = (window as unknown as { __manualRecordingActions?: RecordedAction[] }).__manualRecordingActions;
                return Array.isArray(arr) ? arr : [];
            });
            if (actions.length > 0) {
                all.push(...actions);
            }
        } catch {
            // Cross-origin or detached frame
        }
    }
    if (all.length === 0) {
        try {
            const main = await page.mainFrame().evaluate(() => {
                const arr = (window as unknown as { __manualRecordingActions?: RecordedAction[] }).__manualRecordingActions;
                return Array.isArray(arr) ? arr : [];
            });
            return main;
        } catch {
            return [];
        }
    }
    return all.sort((a, b) => a.t - b.t);
}
