import type { Action } from '../bot/pipeline';

function withLabel<T extends Action>(action: T, label: string): T {
    (action as Action & { label?: string }).label = label;
    return action;
}

/** Attach a label to a custom action for logging */
export function label(action: Action, name: string): Action {
    return withLabel(action, name);
}

export const move = (selector: string): Action =>
    withLabel(({ cursor }) => cursor.move(selector), `move(${selector})`);
export const click = (selector: string): Action =>
    withLabel(({ cursor }) => cursor.click(selector), `click(${selector})`);
export const scroll = (selector: string): Action =>
    withLabel(({ cursor }) => cursor.scroll(selector), `scroll(${selector})`);
export const select = (selector: string, opts: { label: string } | { value: string }): Action =>
    withLabel(
        async ({ page, cursor }) => {
            // Open the dropdown with a real (isTrusted) human click so the WAF sees a pointer
            // trajectory land on the control plus mousedown/focus/click — instead of a value that
            // changes out of nowhere. Escape dismisses the native popup while keeping focus on the
            // <select>, then selectOption sets the value reliably (fires input/change). selectOption
            // is kept because the native option list can't be driven by the mouse via CDP.
            await cursor.click(selector);
            // await page.keyboard.press('Escape');
            await page.selectOption(selector, opts);
        },
        `select(${selector}, ${'label' in opts ? opts.label : opts.value})`
    );
export const typeChars = (text: string): Action =>
    withLabel(({ keyboard }) => keyboard.type(text), `type(${text.length} chars)`);
export const press = (key: string): Action =>
    withLabel(({ keyboard }) => keyboard.press(key), `press("${key}")`);
export const moveRandom = (): Action =>
    withLabel(({ cursor }) => cursor.moveRandom(), 'moveRandom()');
