import type { TrendPoint } from './trend';

/**
 * Server-backed trend — pulls the D1 minute archive from the feed worker
 * and maps it to TrendPoint[] so the chart shows real history that
 * survives refresh and works across devices. Local points (recorded by
 * appendTrend between cron runs) are merged on top for freshness.
 */

const HISTORY_URL = 'https://placar-feed.nicolasqueiroga.workers.dev/history';

/**
 * The 1º turno is a finished historical event: its counting night is
 * Oct 4 14:00 → Oct 5 03:30 BRT (epoch ms, BRT = UTC-3). Pinning the
 * window keeps the chart on that night instead of stretching three weeks
 * of flat-100% cron rows.
 */
const T1_NIGHT_START = 1791133200000; // 2026-10-04 14:00 BRT
const T1_NIGHT_END = 1791181800000; //   2026-10-05 03:30 BRT

/**
 * The 2º-turno counting night: urnas 8h–17h, apuração a partir das 17h,
 * resultado previsto 20h30–21h (TSE). Generous end cap at Oct 26 04:00
 * BRT — trim to the real end once the night is done. Bounding the window
 * keeps pre-count zero-state rows out of the chart.
 */
export const T2_NIGHT_START = 1792958400000; // 2026-10-25 17:00 BRT
export const T2_NIGHT_END = 1792998000000; //   2026-10-26 04:00 BRT

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

export async function fetchServerTrend(race: 'presidente' | 'presidente2' = 'presidente'): Promise<TrendPoint[]> {
  try {
    const query =
      race === 'presidente'
        ? `from=${T1_NIGHT_START}&to=${T1_NIGHT_END}`
        : `from=${T2_NIGHT_START}&to=${T2_NIGHT_END}`;
    const res = await fetch(`${HISTORY_URL}?${query}&race=${race}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { points: HistoryRow[] };
    const out: TrendPoint[] = [];
    for (const p of data.points) {
      if (p.race !== race || p.uf !== 'BR') continue;
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

/**
 * Merge server archive with local points by interleaving on timestamp
 * (local wins exact collisions). The old cutoff at the first local point
 * hid the ENTIRE server archive whenever a stale local point existed —
 * e.g. zeroed pre-count points recorded earlier in the day.
 */
export function mergeTrends(server: TrendPoint[], local: TrendPoint[]): TrendPoint[] {
  if (server.length === 0) return local;
  if (local.length === 0) return server;
  const byTs = new Map<number, TrendPoint>(server.map((p) => [p.t, p]));
  for (const p of local) byTs.set(p.t, p);
  return [...byTs.values()].sort((a, b) => a.t - b.t);
}
