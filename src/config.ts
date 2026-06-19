import * as fs from 'fs';
import * as path from 'path';

export interface PersonalDataConfig {
    nie: string;
    nombre: string;
    /** Optional: exact <option> label on #txtPaisNac (e.g. "ECUADOR"). Used by the Barcelona watcher. */
    nacionalidad?: string;
    /** Optional — unused by the watcher (kept for possible future auto-book). */
    telefono?: string;
    /** Optional — unused by the watcher (kept for possible future auto-book). */
    email?: string;
}

export interface ProxyConfig {
    server: string;
    username: string;
    password: string;
}

export interface ActorConfig {
    id: string;
    typing?: { baseDelay?: number; delayVariance?: number; mistakeChance?: number };
    typingPressDelay?: [number, number];
    cursor?: {
        overshootSpread?: number;
        overshootRadius?: number;
        debug?: boolean;
        waitBeforeMove?: [number, number];
        waitBeforeClick?: [number, number];
        waitBetweenClick?: [number, number];
        scrollDelay?: [number, number];
        maxScrollStep?: number;
        moveRandomRange?: [number, number];
    };
    pipeline?: {
        delayBetweenActions?: [number, number];
        delayBeforeFirstAction?: [number, number];
        delayBeforeLastAction?: [number, number];
    };
}

export interface AppConfig {
    /** Browser profile directory name (e.g. 'test') */
    browserProfile?: string;
    /** Base URL for cita site (e.g. http://localhost:3999 for mock server) */
    baseUrl?: string;
    /** When true (default), first bot detection at TRAMITE step triggers proxy rotation if multiple proxies exist */
    rotateProxyOnTramiteBlock?: boolean;
    location: string;
    tramiteLabel: string;
    offices: string[];
    minCitaDate: string;
    /** Barcelona entry path; falls back to '/icpco/citar' when unset. baseUrl still overrides the host. */
    entryPath?: string;
    /** [minSeconds, maxSeconds] randomized backoff between poll cycles. Runner falls back to 5000ms when unset. */
    pollDelaySeconds?: [number, number];
    personalData: PersonalDataConfig;
    /** Single proxy (legacy) or array for rotation */
    proxy?: ProxyConfig;
    proxies?: ProxyConfig[];
    /** Absolute paths to unpacked extension dirs to load at launch (e.g. Chromixer). */
    extensions?: string[];
    actors?: ActorConfig[];
    keepBrowserOpenOnFailure?: boolean;
    notifications?: {
        failureCountThreshold?: number;
        citaFoundChannels?: ('email' | 'homeassistant' | 'telegram')[];
        criticalAfterSeconds?: number;
        homeassistant?: { url: string; token: string };
        telegram?: { botToken: string; chatId: string };
    };
}

const configPath = path.join(process.cwd(), 'config.json');

export function loadConfig(): AppConfig {
    if (!fs.existsSync(configPath)) {
        throw new Error(
            `Config file not found at ${configPath}. ` +
            'Copy config.example.json to config.json and fill in your values.'
        );
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as AppConfig;
    return {
        ...parsed,
        location: parsed.location ?? '3', // default: Alicante
    };
}

/** Get proxies array: uses proxies if set, else [proxy] for backward compatibility */
export function getProxies(cfg: AppConfig): ProxyConfig[] {
    if (cfg.proxies && cfg.proxies.length > 0) return cfg.proxies;
    if (cfg.proxy) return [cfg.proxy];
    return [];
}

const REFERENCE_ACTOR: ActorConfig = {
    id: 'actor_reference',
    typing: { baseDelay: 60, delayVariance: 30, mistakeChance: 0 },
    typingPressDelay: [60, 100],
    cursor: {
        // debug: true injects a visible <p-mouse-pointer> overlay so you can WATCH the cursor
        // glide + click on each field. It's a detectable DOM artifact — set back to false (and
        // don't commit it on) before real anti-detection runs.
        overshootSpread: 5, overshootRadius: 5, debug: false,
        waitBeforeMove: [50, 200], waitBeforeClick: [100, 300], waitBetweenClick: [50, 150],
        scrollDelay: [100, 200], maxScrollStep: 2000, moveRandomRange: [100, 200],
    },
    pipeline: { delayBetweenActions: [800, 1500], delayBeforeFirstAction: [500, 1000], delayBeforeLastAction: [500, 600] },
};

/** Get actors: uses config.actors if set, else single reference actor */
export function getActors(cfg: AppConfig): ActorConfig[] {
    if (cfg.actors && cfg.actors.length > 0) return cfg.actors;
    return [REFERENCE_ACTOR];
}

export function saveConfig(cfg: AppConfig): void {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Generate a random actor config for testing */
export function generateRandomActor(): ActorConfig {
    return {
        id: `actor_generated_${Date.now()}`,
        typing: {
            baseDelay: rand(40, 100),
            delayVariance: rand(20, 50),
            mistakeChance: Math.random() * 0.05,
        },
        typingPressDelay: [rand(50, 90), rand(90, 130)],
        cursor: {
            overshootSpread: rand(3, 8),
            overshootRadius: rand(3, 8),
            waitBeforeMove: [rand(40, 80), rand(180, 250)],
            waitBeforeClick: [rand(80, 140), rand(260, 340)],
            moveRandomRange: [rand(80, 120), rand(180, 240)],
        },
        pipeline: {
            delayBetweenActions: [rand(500, 900), rand(1200, 1800)],
            delayBeforeFirstAction: [rand(400, 700), rand(900, 1300)],
        },
    };
}
