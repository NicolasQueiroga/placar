import type { Candidate, RaceData, RaceStatus } from './types';

/**
 * Placar feed client — the worker-backed fast path.
 *
 * One fetch per tick returns all races, all UFs (the worker polls TSE on
 * cron so the browser doesn't fire ~30 requests every 15s). Falls back to
 * direct-TSE fetching in useElection if the worker is unreachable.
 */

const FEED_URL = 'https://placar-feed.nicolasqueiroga.workers.dev/feed';

interface FeedCandidate {
  name: string;
  party: string;
  votes: number;
  pct: number;
}

interface FeedRow {
  race: string;
  uf: string;
  sections_counted: number;
  sections_total: number;
  electors: number;
  valid: number;
  turnout: number;
  candidates: string; // JSON
  status: string;
  fetched_at: number;
}

export interface FeedSnapshot {
  ts: number;
  rows: Map<string, RaceData>; // key: `${race}:${uf}`
}

function toRaceData(row: FeedRow): RaceData {
  const cands: FeedCandidate[] = JSON.parse(row.candidates);
  const candidates: Candidate[] = cands.map((c, i) => ({
    id: `${row.race}-${row.uf}-${i}`,
    ballotName: c.name,
    fullName: c.name,
    number: '',
    party: c.party,
    coalition: c.party,
    votes: c.votes,
    percent: c.pct,
    elected: false,
  }));
  return {
    // TSE's final flag ('at') doesn't survive into this file shape — the
    // worker reads a field that isn't there, so everything lands 'partial'.
    // Derive: 100% of sections counted = final.
    status: (row.status === 'final' || (row.sections_total > 0 && row.sections_counted >= row.sections_total) ? 'final' : 'partial') as RaceStatus,
    generatedAt: new Date(row.fetched_at).toISOString(),
    sectionsTotal: row.sections_total,
    sectionsCounted: row.sections_counted,
    electorsTotal: row.electors,
    electorsCounted: row.electors,
    turnout: row.turnout,
    abstention: 0,
    blank: 0,
    nullVotes: 0,
    validVotes: row.valid,
    candidates,
  };
}

export async function fetchFeed(): Promise<FeedSnapshot | null> {
  try {
    const res = await fetch(FEED_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { ts: number; races: FeedRow[] };
    const rows = new Map<string, RaceData>();
    for (const row of data.races) {
      rows.set(`${row.race}:${row.uf}`, toRaceData(row));
    }
    return { ts: data.ts, rows };
  } catch {
    return null;
  }
}
