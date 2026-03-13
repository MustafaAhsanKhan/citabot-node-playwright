import * as fs from 'fs';
import * as path from 'path';

export interface ActorStats {
    runs: number;
    detections: number;
    successes: number;
    noSuitableCita: number;
    lastRun: string;
}

const statsDir = path.join(process.cwd(), 'stats', 'actors');

function getStatsPath(actorId: string): string {
    const safeId = actorId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(statsDir, `${safeId}.json`);
}

export function loadActorStats(actorId: string): ActorStats {
    const p = getStatsPath(actorId);
    if (!fs.existsSync(p)) {
        return { runs: 0, detections: 0, successes: 0, noSuitableCita: 0, lastRun: '' };
    }
    const content = fs.readFileSync(p, 'utf-8');
    return JSON.parse(content) as ActorStats;
}

export function saveActorStats(actorId: string, stats: ActorStats): void {
    if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
    }
    stats.lastRun = new Date().toISOString();
    fs.writeFileSync(getStatsPath(actorId), JSON.stringify(stats, null, 2), 'utf-8');
}

export function recordRun(actorId: string, outcome: 'success' | 'detection' | 'noSuitableCita'): void {
    const stats = loadActorStats(actorId);
    stats.runs++;
    if (outcome === 'success') stats.successes++;
    else if (outcome === 'detection') stats.detections++;
    else if (outcome === 'noSuitableCita') stats.noSuitableCita++;
    saveActorStats(actorId, stats);
}

/** Find actor ID with highest detection rate (worst performer) among given IDs */
export function findWorstActor(actorIds: string[]): string | undefined {
    if (actorIds.length === 0) return undefined;
    let worst: string | undefined;
    let worstRate = -1;
    for (const id of actorIds) {
        const s = loadActorStats(id);
        const rate = s.runs > 0 ? s.detections / s.runs : 0;
        if (rate > worstRate) {
            worstRate = rate;
            worst = id;
        }
    }
    return worst;
}
