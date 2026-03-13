import * as path from 'path';
import * as fs from 'fs';
import type { Page } from 'patchright';
import type { Request, Response } from 'patchright';
import type { AppConfig } from '../config';
import type { RecordedAction } from './action-recorder';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB max per body
const BOT_DETECTED_LOG_DIR = 'logs/bot-detected';
const MANUAL_SESSION_LOG_DIR = 'logs/manual-session';

function getDomainHost(config: AppConfig): string {
    const base = config.baseUrl ?? 'https://icp.administracionelectronica.gob.es';
    try {
        return new URL(base).hostname;
    } catch {
        return 'icp.administracionelectronica.gob.es';
    }
}

function isDomainRequest(url: string, host: string): boolean {
    try {
        const urlHost = new URL(url).hostname;
        return urlHost === host || urlHost.endsWith('.' + host);
    } catch {
        return false;
    }
}

async function safeGetBody(response: Response): Promise<string> {
    try {
        const buf = await response.body();
        if (buf.length > MAX_BODY_BYTES) {
            const slice = buf.slice(0, MAX_BODY_BYTES);
            try {
                return `[truncated, ${buf.length} bytes total] ` + slice.toString('utf-8').replace(/\0/g, '');
            } catch {
                return `[binary, ${buf.length} bytes, truncated]`;
            }
        }
        try {
            return buf.toString('utf-8');
        } catch {
            return `[binary, ${buf.length} bytes]`;
        }
    } catch {
        return '[failed to read body]';
    }
}

/** Sanitize URL to a safe filename for saving JS */
function urlToJsFilename(url: string, index: number): string {
    try {
        const u = new URL(url);
        const base = path.basename(u.pathname) || 'script';
        const ext = path.extname(base) || '.js';
        const name = path.basename(base, ext);
        const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
        return `${safe}-${index}${ext}`;
    } catch {
        return `script-${index}.js`;
    }
}

export interface NetworkEntry {
    url: string;
    method: string;
    resourceType: string;
    requestHeaders: Record<string, string>;
    postData?: string;
    status?: number;
    statusText?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    /** Path to saved file (for script resources) */
    responsePath?: string;
    timestamp: string;
    frameUrl?: string;
}

export interface PageSnapshot {
    url: string;
    cookies: string;
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    timestamp: string;
}

export type BlockMode = 'server' | 'client';

function enrichActionsWithSpeed(actions: RecordedAction[]): RecordedAction[] {
    const out: RecordedAction[] = [];
    let prevMove: { x: number; y: number } | null = null;
    for (const a of actions) {
        const copy = { ...a };
        if (a.type === 'mousemove' && a.x !== undefined && a.y !== undefined) {
            if (prevMove !== null && (copy.delayMs ?? 0) > 0) {
                const dist = Math.hypot(a.x - prevMove.x, a.y - prevMove.y);
                copy.speedPxPerMs = Math.round((dist / copy.delayMs!) * 100) / 100;
            }
            prevMove = { x: a.x, y: a.y };
        } else if (a.type !== 'mousemove') {
            prevMove = null;
        }
        out.push(copy);
    }
    return out;
}

export interface BotDetectedMeta {
    timestamp: string;
    attempt: number;
    actorId: string;
    stepId: string;
    errorMessage: string;
    blockMode?: BlockMode;
}

export interface BotDetectedLog {
    timestamp: string;
    attempt: number;
    actorId: string;
    stepId: string;
    errorMessage: string;
    network: NetworkEntry[];
    pageSnapshot?: PageSnapshot;
}

export class NetworkRecorder {
    private entries: NetworkEntry[] = [];
    private requestToEntry: Map<Request, NetworkEntry> = new Map();
    private readonly host: string;
    private readonly config: AppConfig;

    constructor(config: AppConfig) {
        this.config = config;
        this.host = getDomainHost(config);
    }

    attach(page: Page): void {
        this.entries = [];
        this.requestToEntry.clear();
        page.on('request', (request: Request) => {
            const url = request.url();
            if (!isDomainRequest(url, this.host)) return;
            const resourceType = request.resourceType();
            const entry: NetworkEntry = {
                url,
                method: request.method(),
                resourceType,
                requestHeaders: request.headers(),
                postData: request.postData() ?? undefined,
                timestamp: new Date().toISOString(),
                frameUrl: request.frame().url(),
            };
            this.entries.push(entry);
            this.requestToEntry.set(request, entry);
        });
        page.on('response', async (response: Response) => {
            const request = response.request();
            const url = request.url();
            if (!isDomainRequest(url, this.host)) return;
            const entry = this.requestToEntry.get(request);
            if (entry) {
                entry.status = response.status();
                entry.statusText = response.statusText();
                entry.responseHeaders = response.headers();
                entry.responseBody = await safeGetBody(response);
            }
        });
    }

    getEntries(): NetworkEntry[] {
        return [...this.entries];
    }

    private inferBlockMode(entries: NetworkEntry[]): BlockMode | undefined {
        const doc = entries.find((e) => e.resourceType === 'document');
        if (!doc?.responseBody) return undefined;
        return doc.responseBody.includes('Request Rejected') ? 'server' : 'client';
    }

    async capturePageSnapshot(page: Page): Promise<PageSnapshot | undefined> {
        try {
            const snapshot = await page.evaluate(() => {
                let localStorage: Record<string, string> = {};
                let sessionStorage: Record<string, string> = {};
                try {
                    for (let i = 0; i < window.localStorage.length; i++) {
                        const k = window.localStorage.key(i);
                        if (k) localStorage[k] = window.localStorage.getItem(k) ?? '';
                    }
                } catch {
                    localStorage = { _error: 'access denied' };
                }
                try {
                    for (let i = 0; i < window.sessionStorage.length; i++) {
                        const k = window.sessionStorage.key(i);
                        if (k) sessionStorage[k] = window.sessionStorage.getItem(k) ?? '';
                    }
                } catch {
                    sessionStorage = { _error: 'access denied' };
                }
                return {
                    url: window.location.href,
                    cookies: document.cookie,
                    localStorage,
                    sessionStorage,
                };
            });
            return {
                ...snapshot,
                timestamp: new Date().toISOString(),
            };
        } catch {
            return undefined;
        }
    }

    async dump(
        page: Page,
        options: {
            attempt: number;
            actorId: string;
            stepId: string;
            errorMessage: string;
            incidentType?: 'bot-detected' | 'no-citas' | 'manual';
            /** Recorded mouse/keyboard actions (manual sessions only) */
            actions?: RecordedAction[];
        }
    ): Promise<string> {
        const isManual = options.incidentType === 'manual';
        const baseDir = path.join(
            process.cwd(),
            isManual ? MANUAL_SESSION_LOG_DIR : BOT_DETECTED_LOG_DIR
        );
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dirPrefix =
            options.incidentType === 'no-citas'
                ? 'no-citas-detected'
                : options.incidentType === 'manual'
                  ? 'manual-session'
                  : 'bot-detected';
        const incidentDir = path.join(baseDir, `${dirPrefix}-${timestamp}`);
        fs.mkdirSync(incidentDir, { recursive: true });

        const pageSnapshot = await this.capturePageSnapshot(page);
        const entries = this.getEntries();
        const blockMode = this.inferBlockMode(entries);

        const meta: BotDetectedMeta = {
            timestamp: new Date().toISOString(),
            attempt: options.attempt,
            actorId: options.actorId,
            stepId: options.stepId,
            errorMessage: options.errorMessage,
            ...(blockMode && { blockMode }),
        };
        fs.writeFileSync(path.join(incidentDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

        if (pageSnapshot) {
            fs.writeFileSync(
                path.join(incidentDir, 'page-snapshot.json'),
                JSON.stringify(pageSnapshot, null, 2),
                'utf-8'
            );
        }

        const jsDir = path.join(incidentDir, 'js');
        let scriptIndex = 0;
        const entriesForLog = entries.map((e) => {
            const { responseBody, ...rest } = e;
            const out = { ...rest } as NetworkEntry;
            const isSavableScript =
                e.resourceType === 'script' &&
                responseBody &&
                responseBody.length > 0 &&
                !responseBody.startsWith('[binary') &&
                !responseBody.startsWith('[failed');
            if (isSavableScript) {
                fs.mkdirSync(jsDir, { recursive: true });
                const filename = urlToJsFilename(e.url, scriptIndex++);
                const jsPath = path.join(jsDir, filename);
                try {
                    fs.writeFileSync(jsPath, responseBody, 'utf-8');
                    out.responsePath = `js/${filename}`;
                    out.responseBody = `[saved to ${out.responsePath}, ${responseBody.length} chars]`;
                } catch {
                    out.responseBody = responseBody.length > 5000 ? `[truncated, ${responseBody.length} chars]` : responseBody;
                }
            } else if (responseBody !== undefined) {
                out.responseBody = responseBody;
            }
            return out;
        });

        fs.writeFileSync(
            path.join(incidentDir, 'requests.json'),
            JSON.stringify(entriesForLog, null, 2),
            'utf-8'
        );

        const ajaxRequests = entries.filter((e) => e.resourceType === 'xhr' || e.resourceType === 'fetch');
        if (ajaxRequests.length > 0) {
            fs.writeFileSync(
                path.join(incidentDir, 'ajaxRequests.json'),
                JSON.stringify(
                    {
                        note: 'Ajax requests (XHR/fetch) captured from network activity.',
                        count: ajaxRequests.length,
                        requests: ajaxRequests.map((e) => ({
                            timestamp: e.timestamp,
                            url: e.url,
                            method: e.method,
                            resourceType: e.resourceType,
                            status: e.status,
                            statusText: e.statusText,
                            postData: e.postData,
                            responseBody: e.responseBody,
                        })),
                    },
                    null,
                    2
                ),
                'utf-8'
            );
        }

        if (options.actions && options.actions.length > 0) {
            const enriched = enrichActionsWithSpeed(options.actions);
            fs.writeFileSync(
                path.join(incidentDir, 'actions.json'),
                JSON.stringify(
                    {
                        sessionStartNote: 'All t values are ms since first event. delayMs = ms since previous event. speedPxPerMs = mouse movement speed between consecutive mousemove events.',
                        count: enriched.length,
                        actions: enriched,
                    },
                    null,
                    2
                ),
                'utf-8'
            );
        }

        try {
            await page.screenshot({ path: path.join(incidentDir, 'screenshot.png') });
        } catch {
            // Screenshot may fail if page is closing
        }

        try {
            const html = await page.content();
            fs.writeFileSync(path.join(incidentDir, 'page.html'), html, 'utf-8');
        } catch {
            // HTML capture may fail
        }

        const msg =
            options.incidentType === 'no-citas'
                ? 'No citas'
                : isManual
                  ? 'Manual session'
                  : 'Bot detected';
        console.log(`[NetworkRecorder] ${msg} - saved log to ${incidentDir}`);
        return incidentDir;
    }
}
