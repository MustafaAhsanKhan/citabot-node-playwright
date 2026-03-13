import type {BrowserContext, Page} from 'patchright';
import NewBrowser from './browser';
import {
    loadConfig,
    getProxies,
    getActors,
    saveConfig,
    generateRandomActor,
    type AppConfig,
    type ProxyConfig,
    type ActorConfig,
} from '../config';
import { recordRun, findWorstActor } from '../stats';
import { notifyFailure, notifyFailureResolved, notifyCitaFound, notifyCritical, notifyRecoveryNeeded } from '../notifications';
import { sleep } from '../misc';
import {RetryError, BotDetectedError, NoSuitableCitaError, RestartFromBeginning} from './errors';
import { RunResult, StepId } from '../steps/types';
import { NetworkRecorder } from './network-recorder';
import {
    installActionRecorder,
    ensureRecordersInjected,
    collectRecordedActions,
} from './action-recorder';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const VIEWPORT_PRESETS: { width: number; height: number }[] = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
    { width: 2560, height: 1440 },
];

const randomViewport = () => VIEWPORT_PRESETS[Math.floor(Math.random() * VIEWPORT_PRESETS.length)];

export enum ConnectionErrorPattern {
    TunnelFailed = 'ERR_TUNNEL_CONNECTION_FAILED',
    ProxyFailed = 'ERR_PROXY_CONNECTION_FAILED',
    EmptyResponse = 'ERR_EMPTY_RESPONSE ',
    NetError = 'net::ERR_',
}

export interface RecoveryAction {
    rotateProxy?: boolean;
    removeProxy?: boolean;
    /** Clear cookies and localStorage (run on page when available) */
    clearCookies?: boolean;
    rotateActor?: boolean;
    sleepMs?: number;
    closeBrowser?: boolean;
    regenerateActor?: boolean;
    /** Keep browser open for manual recovery, then exit */
    recoveryMode?: boolean;
    restartPreservingPage?: boolean;
}

export interface RunnerContext {
    config: AppConfig;
    proxies: ProxyConfig[];
    actors: ActorConfig[];
    currentProxy: ProxyConfig | undefined;
    currentActor: ActorConfig;
    consecutiveBotDetections: number;
    consecutiveFailures: number;
}

export type BotFn = (
    page: import('patchright').Page,
    actor?: ActorConfig,
    stepRef?: { current: StepId },
    runOptions?: { randomMoveProbability?: number }
) => Promise<string | RunResult>;

function createProxyRotator(proxies: ProxyConfig[]) {
    let index = 0;
    return {
        current(): ProxyConfig | undefined {
            if (proxies.length === 0) return undefined;
            return proxies[index];
        },
        rotate(): ProxyConfig | undefined {
            if (proxies.length === 0) return undefined;
            index = (index + 1) % proxies.length;
            return proxies[index];
        },
    };
}

function createActorRotator(actors: ActorConfig[]) {
    let index = 0;
    return {
        current(): ActorConfig {
            return actors[index];
        },
        rotate(): { actor: ActorConfig; completedCycle: boolean } {
            index = (index + 1) % actors.length;
            return { actor: actors[index], completedCycle: index === 0 };
        },
    };
}

function isConnectionError(message: string): boolean {
    return (
        message.includes(ConnectionErrorPattern.TunnelFailed) ||
        message.includes(ConnectionErrorPattern.ProxyFailed) ||
        message.includes(ConnectionErrorPattern.NetError) ||
        message.includes(ConnectionErrorPattern.EmptyResponse)
    );
}

async function waitForEnter(message = 'Press Enter to continue...'): Promise<void> {
    const rl = readline.createInterface({ input, output });
    await rl.question(`${message}\n`);
    rl.close();
}

export class BotRunner {
    private config: AppConfig;
    private botFn: BotFn;
    private proxies: ProxyConfig[];
    private actors: ActorConfig[];
    private proxyRotator: ReturnType<typeof createProxyRotator>;
    private actorRotator: ReturnType<typeof createActorRotator>;
    private currentProxy: ProxyConfig | undefined;
    private currentActor: ActorConfig;
    private browser: BrowserContext | null = null;
    private consecutiveBotDetections = 0;
    private consecutiveTramiteBlocks = 0;
    private consecutiveFailures = 0;
    private failureNotificationSent = false;
    private attemptCount = 0;
    private randomMoveProbability = 0.02;
    private readonly failureThreshold: number;
    private readonly criticalAfterSeconds: number;
    private static readonly RANDOM_MOVE_PROB_DEFAULT = 0.02;
    private static readonly RANDOM_MOVE_PROB_AFTER_FIRST_DETECTION = 0.15;

    constructor(config: AppConfig, botFn: BotFn, options?: { failureThreshold?: number; criticalAfterSeconds?: number }) {
        this.config = config;
        this.botFn = botFn;
        this.proxies = getProxies(config);
        this.actors = getActors(config);
        this.proxyRotator = createProxyRotator(this.proxies);
        this.actorRotator = createActorRotator(this.actors);
        this.currentProxy = this.proxyRotator.current() ?? config.proxy;
        this.currentActor = this.actorRotator.current();
        this.failureThreshold = options?.failureThreshold ?? config.notifications?.failureCountThreshold ?? 5;
        this.criticalAfterSeconds = options?.criticalAfterSeconds ?? config.notifications?.criticalAfterSeconds ?? 60;
    }

    async run(): Promise<never> {
        const browserProfile = this.config.browserProfile ?? 'test';
        this.browser = await NewBrowser({ userName: browserProfile, proxy: this.currentProxy });
        await this.browser.clearCookies();
        await installActionRecorder(this.browser);
        let prevPage: Page | undefined;
        let networkRecorder: NetworkRecorder;

        while (true) {
            this.attemptCount++;
            let page: Page
            let pagePreloaded = false;
            if (prevPage) {
                console.log('Reusing previous page');
                page = prevPage;
                pagePreloaded = true;
            } else {
                page = await this.browser!.newPage();
                page.on('framenavigated', () => ensureRecordersInjected(page));
                networkRecorder = new NetworkRecorder(this.config);
                networkRecorder.attach(page);
            }

            const stepRef = { current: StepId.RegionSelect };
            const runOptions = { randomMoveProbability: this.randomMoveProbability, pagePreloaded };
            try {
                const citaDetails = await this.botFn(page, this.currentActor, stepRef, runOptions);
                if (citaDetails === RunResult.RecoveryNeeded) {
                    console.log('Error at CITA_SELECT, keeping browser open for manual recovery.');
                    await waitForEnter('Press Enter to close browser and exit...');
                    await this.browser!.close();
                    process.exit(1);
                }
                if (this.failureNotificationSent) {
                    notifyFailureResolved(this.config);
                    this.failureNotificationSent = false;
                }
                this.consecutiveBotDetections = 0;
                this.consecutiveTramiteBlocks = 0;
                this.consecutiveFailures = 0;
                this.randomMoveProbability = BotRunner.RANDOM_MOVE_PROB_DEFAULT;
                recordRun(this.currentActor.id, 'success');
                notifyCitaFound(this.config, citaDetails);
                const criticalTimer = setTimeout(() => notifyCritical(this.config), this.criticalAfterSeconds * 1000);
                await waitForEnter('Press Enter to skip urgent notification...');
                clearTimeout(criticalTimer);
                await waitForEnter();
            } catch (e: unknown) {
                this.consecutiveFailures++;
                if (this.consecutiveFailures >= this.failureThreshold && !this.failureNotificationSent) {
                    notifyFailure(this.config, this.consecutiveFailures);
                    this.failureNotificationSent = true;
                }
                const action = this.handleError(e as Error, stepRef);
                console.log(`Error at step ${stepRef.current}, retrying...`);
                console.log(`Action: ${JSON.stringify(action, null, 2)}`);
                prevPage = undefined;
                if (action.restartPreservingPage) {
                    prevPage = page
                }
                if (action.recoveryMode) {
                    console.log(`Error at step ${stepRef.current}, keeping browser open for manual recovery.`);
                    await waitForEnter('Press Enter to close browser and exit...');
                    if (this.browser) await this.browser.close();
                    process.exit(1);
                }
                if (e instanceof RetryError) {
                    if (e.message.includes('No citas')) {
                        const actions = await collectRecordedActions(page);
                        await networkRecorder!.dump(page, {
                            attempt: this.attemptCount,
                            actorId: this.currentActor.id,
                            stepId: stepRef.current,
                            errorMessage: (e as Error).message,
                            incidentType: 'no-citas',
                            actions,
                        });
                    }
                    console.log(`${e.message}: retrying in ${e.timeout / 1000}s...`);
                }
                if (e instanceof BotDetectedError) {
                    const actions = await collectRecordedActions(page);
                    await networkRecorder!.dump(page, {
                        attempt: this.attemptCount,
                        actorId: this.currentActor.id,
                        stepId: stepRef.current,
                        errorMessage: (e as Error).message,
                        actions,
                    });
                    if (this.consecutiveBotDetections === 1) {
                        const rotating = action.rotateProxy
                            ? ' rotating proxy and clearing cookies/storage, retrying...'
                            : ' clearing cookies and local storage, retrying...';
                        console.log(`Bot detected first time (${stepRef.current})${rotating}`);
                    } else {
                        console.log(`Bot detected again, rotating to actor ${this.currentActor.id}, retrying in 10s...`);
                    }
                }
                if (this.proxies.length > 1 && isConnectionError(String((e as Error)?.message || ''))) {
                    console.log('Tunnel connection failed, rotating proxy...');
                }
                await this.applyRecovery(action, page, stepRef);
                if (!action.closeBrowser && !action.restartPreservingPage) await page.close();
                if (action.sleepMs) await sleep(action.sleepMs);
            }
        }
    }

    private handleError(e: Error, stepRef: { current: StepId }): RecoveryAction {
        if (e instanceof RestartFromBeginning) {
            return {restartPreservingPage: true, sleepMs: 5000};
        }

        if (e instanceof RetryError) {
            const shouldRotate = e.rotateProxy && (e.removeProxy ? this.proxies.length >= 1 : this.proxies.length > 1);
            return {
                rotateProxy: shouldRotate && !e.removeProxy,
                removeProxy: shouldRotate && e.removeProxy,
                sleepMs: e.timeout,
                closeBrowser: shouldRotate,
            };
        }
        if (e instanceof BotDetectedError) {
            recordRun(this.currentActor.id, 'detection');
            this.consecutiveBotDetections++;
            if (stepRef.current === StepId.Tramite) {
                this.consecutiveTramiteBlocks++;
            } else {
                this.consecutiveTramiteBlocks = 0;
            }
            if (this.consecutiveBotDetections === 1) {
                this.randomMoveProbability = BotRunner.RANDOM_MOVE_PROB_AFTER_FIRST_DETECTION;
                const rotateOnFirstTramite =
                    (this.config.rotateProxyOnTramiteBlock !== false) &&
                    this.proxies.length > 1 &&
                    stepRef.current === StepId.Tramite;
                return {
                    clearCookies: true,
                    ...(rotateOnFirstTramite && { rotateProxy: true, closeBrowser: true }),
                };
            }
            const { actor: nextActor, completedCycle } = this.actorRotator.rotate();
            this.currentActor = nextActor;
            const action: RecoveryAction = {
                rotateActor: true,
                clearCookies: true,
                closeBrowser: true,
                sleepMs: 10000,
            };
            if (completedCycle && this.actors.length > 1) {
                action.regenerateActor = true;
            }
            const shouldRotateProxy =
                this.proxies.length > 1 &&
                (this.consecutiveBotDetections >= 5 ||
                    (stepRef.current === StepId.Tramite && this.consecutiveTramiteBlocks >= 2));
            if (shouldRotateProxy) {
                action.rotateProxy = true;
                if (this.consecutiveTramiteBlocks >= 2) this.consecutiveTramiteBlocks = 0;
                if (this.consecutiveBotDetections >= 5) this.consecutiveBotDetections = 0;
            }
            return action;
        }
        if (e instanceof NoSuitableCitaError) {
            recordRun(this.currentActor.id, 'noSuitableCita');
            return {};
        }
        if (this.proxies.length > 1 && isConnectionError(String(e?.message || ''))) {
            return { rotateProxy: true, clearCookies: true, closeBrowser: true };
        }
        const keepOpen =
            (this.config.keepBrowserOpenOnFailure !== false) && stepRef.current === StepId.CitaSelect;
        if (keepOpen) {
            return { recoveryMode: true };
        }
        return { sleepMs: 10000 };
    }

    private async applyRecovery(
        action: RecoveryAction,
        page: import('patchright').Page,
        stepRef: { current: StepId }
    ): Promise<void> {
        const browserProfile = this.config.browserProfile ?? 'test';

        if (action.removeProxy && this.currentProxy) {
            this.proxies = this.proxies.filter(
                (p) => !(p.server === this.currentProxy?.server && p.username === this.currentProxy?.username && p.password === this.currentProxy?.password)
            );
            this.config.proxies = this.proxies;
            //saveConfig(this.config);
            if (this.proxies.length === 0) {
                console.log('No proxies left, exiting...');
                process.exit(1);
            }
            console.log(`Proxy ${this.currentProxy?.server} removed from rotation (${this.proxies.length} left)`);
            this.proxyRotator = createProxyRotator(this.proxies);
            console.log(`403 detected, removed proxy from rotation (${this.proxies.length} left)`);
        }
        if (action.clearCookies && this.browser) {
            await this.browser.clearCookies();
            await this.clearLocalStorage(page);
        }
        if ((action.rotateProxy || action.removeProxy) && this.proxies.length > 1) {
            console.log('Rotating proxy...');
            this.currentProxy = this.proxyRotator.rotate() ?? this.proxyRotator.current();
        }
        if (action.rotateActor) {
            this.currentActor = this.actorRotator.current();
            this.randomMoveProbability = BotRunner.RANDOM_MOVE_PROB_DEFAULT;
        }
        if (action.regenerateActor) {
            this.randomMoveProbability = BotRunner.RANDOM_MOVE_PROB_DEFAULT;
            const candidate = generateRandomActor();
            console.log('All actors tried, testing new actor:', candidate.id);
            await page.close();
            if (this.browser) await this.browser.close();
            this.browser = await NewBrowser({ userName: browserProfile, proxy: this.currentProxy });
            const testPage = await this.browser.newPage();
            await testPage.setViewportSize(randomViewport());
            await testPage.route('**/*', (r) => {
                if (['image', 'media', 'font'].includes(r.request().resourceType())) r.abort();
                else r.continue();
            });
            try {
                const result = await this.botFn(testPage, candidate, { current: StepId.Tramite });
                if (result === RunResult.RecoveryNeeded) throw new Error('CITA_SELECT failed');
                await testPage.close();
                const worst = findWorstActor(this.actors.map((a) => a.id));
                if (worst) {
                    const newActors = this.actors.filter((a) => a.id !== worst);
                    newActors.push(candidate);
                    this.config.actors = newActors;
                    saveConfig(this.config);
                    this.actors = newActors;
                    this.actorRotator = createActorRotator(this.actors);
                    this.currentActor = this.actorRotator.current();
                    console.log(`New actor ${candidate.id} added, removed ${worst}`);
                }
            } catch {
                await testPage.close();
                console.log('New actor failed, continuing with rotation');
            }
            return;
        }
        if (action.closeBrowser && this.browser) {
            await this.browser.close();
            this.browser = await NewBrowser({ userName: browserProfile, proxy: this.currentProxy });
        }
    }

    private async clearLocalStorage(page: import('patchright').Page): Promise<void> {
        try {
            await page.evaluate(() => {
                try {
                    localStorage.clear();
                    sessionStorage.clear();
                } catch {
                    // Storage may be unavailable on some origins
                }
            });
        } catch {
            // Page may be closed or unavailable
        }
    }
}
