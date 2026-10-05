import type { RaceData } from './types';

export interface TrendPoint {
  t: number; // epoch ms
  counted: number; // electors counted
  percents: Record<string, number>; // candidateId -> percent
}

const KEY = 'placar:trend:v2:'; // + race key — series must never mix races
const MAX_POINTS = 720; // 12h at 60s — plenty for election night

export function loadTrend(raceKey: string): TrendPoint[] {
  try {
    const raw = localStorage.getItem(KEY + raceKey);
    return raw ? (JSON.parse(raw) as TrendPoint[]) : [];
  } catch {
    return [];
  }
}

/** Drop a race's stored series (e.g. when the race goes final). */
export function clearTrend(raceKey: string) {
  try {
    localStorage.removeItem(KEY + raceKey);
  } catch {
    /* nothing to do */
  }
}

/** Append a point if the data actually moved; returns updated array. */
export function appendTrend(points: TrendPoint[], national: RaceData, raceKey: string): TrendPoint[] {
  const top = national.candidates.slice(0, 4);
  if (top.length === 0) return points;
  const percents: Record<string, number> = {};
  for (const c of top) percents[c.id] = c.percent;

  const last = points[points.length - 1];
  const moved =
    !last ||
    national.electorsCounted > last.counted ||
    top.some((c) => Math.abs((last.percents[c.id] ?? 0) - c.percent) > 0.01);
  if (!moved) return points;

  const next = [...points, { t: Date.now(), counted: national.electorsCounted, percents }];
  const trimmed = next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
  try {
    localStorage.setItem(KEY + raceKey, JSON.stringify(trimmed));
  } catch {
    /* storage full/disabled — in-memory trend still works */
  }
  return trimmed;
}
