import type { AppConfig } from '../config';

export interface TelegramDeps {
    fetchFn?: typeof fetch;
    logger?: (msg: string) => void;
}

/** Build the Telegram sendMessage URL. The bot token is embedded in the path — never log this value. */
export function buildTelegramUrl(botToken: string): string {
    return `https://api.telegram.org/bot${botToken}/sendMessage`;
}

export function buildTelegramBody(
    chatId: string,
    title: string,
    message: string
): { chat_id: string; text: string } {
    return { chat_id: chatId, text: `${title}\n${message}` };
}

/**
 * Send a Telegram push. Fail-soft: never throws. On error logs the HTTP status / a generic
 * message only — never the URL or token (so the token cannot leak into logs or network dumps).
 */
export async function sendTelegram(
    cfg: AppConfig,
    payload: { title: string; message: string },
    deps: TelegramDeps = {}
): Promise<void> {
    const tg = cfg.notifications?.telegram;
    if (!tg?.botToken || !tg?.chatId) return;
    const fetchFn = deps.fetchFn ?? fetch;
    const log = deps.logger ?? ((m: string) => console.error(m));
    try {
        const res = await fetchFn(buildTelegramUrl(tg.botToken), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildTelegramBody(tg.chatId, payload.title, payload.message)),
        });
        if (!res.ok) log(`Telegram notification failed: ${res.status}`);
    } catch {
        log('Telegram notification failed: request error');
    }
}
