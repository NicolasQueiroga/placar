import type { TrendPoint } from './trend';

/**
 * Server-backed trend — pulls the D1 minute archive from the feed worker
 * and maps it to TrendPoint[] so the chart shows real history that
 * survives refresh and works across devices. Local points (recorded by
 * appendTrend between cron runs) are merged on top for freshness.
 */

const HISTORY_URL = 'https://placar-feed.nicolasqueiroga.workers.dev/history?minutes=180';

interface HistoryCandidate {
  name: string;
  id: string; // sqcand — same id the frontend uses
  party: string;
  votes: number;
  pct: number;
}

interface HistoryRow {
  ts: number;
  race: string;
  uf: string;
  sections_pct: number;
  candidates: string;
}

export async function fetchServerTrend(): Promise<TrendPoint[]> {
  try {
    const res = await fetch(HISTORY_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { points: HistoryRow[] };
    const out: TrendPoint[] = [];
    for (const p of data.points) {
      if (p.race !== 'presidente' || p.uf !== 'BR') continue;
      const cands: HistoryCandidate[] = JSON.parse(p.candidates);
      const percents: Record<string, number> = {};
      for (const c of cands.slice(0, 4)) percents[c.id] = c.pct;
      out.push({ t: p.ts, counted: p.sections_pct, percents });
    }
    return out;
  } catch {
    return [];
  }
}

/** Merge server archive with local points; local wins on overlap. */
export function mergeTrends(server: TrendPoint[], local: TrendPoint[]): TrendPoint[] {
  if (server.length === 0) return local;
  if (local.length === 0) return server;
  const firstLocal = local[0].t;
  const kept = server.filter((p) => p.t < firstLocal);
  return [...kept, ...local];
}
