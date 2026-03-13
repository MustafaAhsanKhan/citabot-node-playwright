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
        ({ page }) => page.selectOption(selector, opts),
        `select(${selector}, ${'label' in opts ? opts.label : opts.value})`
    );
export const typeChars = (text: string): Action =>
    withLabel(({ keyboard }) => keyboard.type(text), `type(${text.length} chars)`);
export const press = (key: string): Action =>
    withLabel(({ keyboard }) => keyboard.press(key), `press("${key}")`);
export const moveRandom = (): Action =>
    withLabel(({ cursor }) => cursor.moveRandom(), 'moveRandom()');
