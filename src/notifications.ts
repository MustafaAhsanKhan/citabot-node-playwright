import type { AppConfig } from './config';
import { sendTelegram } from './notifications/telegram';

type NotifyPayload = { message: string; title: string; data?: Record<string, unknown> }

async function callHomeAssistant(cfg: AppConfig, payload: NotifyPayload) {
    const ha = cfg.notifications?.homeassistant
    if (!ha?.url || !ha?.token) return
    const url = ha.url.replace(/\/$/, '') + '/api/services/notify/notify'
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ha.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })
        if (!res.ok) console.error('HomeAssistant notification failed:', res.status, await res.text())
    } catch (e) {
        console.error('HomeAssistant notification failed:', e)
    }
}

export async function notifyFailure(cfg: AppConfig, consecutiveFailures: number): Promise<void> {
    const msg = `Cita bot: ${consecutiveFailures} consecutive failures. Proxy/anti-bot may not be working.`
    console.log('NOTIFICATION:', msg)
    await callHomeAssistant(cfg, { message: msg, title: 'Cita Bot - Failure Alert' })
    await sendTelegram(cfg, { title: 'Cita Bot - Failure Alert', message: msg })
}

export async function notifyFailureResolved(cfg: AppConfig): Promise<void> {
    const msg = 'Cita bot: Consecutive failure issue resolved. Running normally again.'
    console.log('NOTIFICATION:', msg)
    await callHomeAssistant(cfg, { message: msg, title: 'Cita Bot - Resolved' })
}

export async function notifyCitaFound(cfg: AppConfig, citaDetails?: string): Promise<void> {
    const msg = citaDetails
        ? `Cita bot: Suitable cita found! ${citaDetails} - Complete manually.`
        : 'Cita bot: Suitable cita found! Complete the booking manually.'
    console.log('NOTIFICATION:', msg)
    await callHomeAssistant(cfg, { message: msg, title: 'Cita Bot - Cita Found!' })
    await sendTelegram(cfg, { title: 'Cita Bot - Cita Found!', message: msg })
}

export async function notifyRecoveryNeeded(cfg: AppConfig): Promise<void> {
    const msg = 'Cita bot: Error at cita selection. Browser kept open for manual recovery.'
    console.log('NOTIFICATION:', msg)
    await callHomeAssistant(cfg, { message: msg, title: 'Cita Bot - Recovery Needed' })
}

/** Critical notification data for Companion app: Android (ttl/priority) and iOS (interruption-level). */
const CRITICAL_DATA = {
    ttl: 0,
    priority: 'high' as const,
    push: { 'interruption-level': 'critical' as const },
}

export async function notifyCritical(cfg: AppConfig): Promise<void> {
    const msg = 'Cita bot: URGENT - Cita found but no response. Complete now!'
    console.log('CRITICAL NOTIFICATION:', msg)
    await callHomeAssistant(cfg, {
        message: msg,
        title: 'Cita Bot - URGENT',
        data: CRITICAL_DATA,
    })
}
