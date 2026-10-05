/**
 * Placar feed — the "better version" of a snapshot backend.
 *
 * What it does (cron every minute while elections run):
 *  1. Pulls TSE official JSON for every race (presidente BR + 27 UFs, exterior,
 *     governador, senador) — the same public endpoints the frontend uses.
 *  2. Normalizes to one compact document (votes by candidate, sections, electors).
 *  3. Stores a snapshot per minute in D1 — permanent history, survives refresh,
 *     cross-device, and powers the trend chart from real archived data.
 *  4. Serves GET /feed (latest) and GET /history?minutes=N with edge caching.
 *
 * Why better than direct-TSE-from-browser:
 *  - 1 request per tick instead of ~30
 *  - history that survives localStorage
 *  - TSE load reduced (we poll once, serve many)
 *
 * The frontend keeps its direct-TSE path as fallback — if this worker
 * ever fails, the site still works.
 */

interface Env {
  DB: D1Database;
}

const TSE_BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO','ZZ'] as const;

const RACES = [
  { key: 'presidente', election: '6257', cargo: '0001', scope: 'br' as const },
  { key: 'presidente2', election: '6258', cargo: '0001', scope: 'br' as const }, // runoff, Oct 25
  { key: 'governador', election: '6259', cargo: '0003', scope: 'uf' as const },
  { key: 'senador', election: '6259', cargo: '0005', scope: 'uf' as const },
];

interface TseCand {
  nmu: string;
  sqcand?: string;
  vap: string;
  pvap: string;
  st?: string;
}
interface TseUnified {
  cdabr: string;
  s?: { st?: string; ts?: string };
  v?: { vvc?: string; vvnom?: string; est?: string };
  c?: { at?: string };
  carg?: { agr?: { par?: { sg?: string; cand?: TseCand[] }[] }[] }[];
}

interface SnapshotRow {
  race: string;
  uf: string;
  sections_counted: number;
  sections_total: number;
  electors: number;
  valid: number;
  turnout: number;
  candidates: string; // JSON: [{name, id, party, votes, pct}]
  status: string;
  fetched_at: number;
}

async function fetchTse(url: string): Promise<TseUnified | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.log(`tse ${res.status}: ${url}`);
      return null;
    }
    return (await res.json()) as TseUnified;
  } catch (e) {
    console.log(`tse error ${e instanceof Error ? e.message : e}: ${url}`);
    return null;
  }
}

function normalize(raw: TseUnified, race: string, uf: string): SnapshotRow | null {
  const carg = raw.carg?.[0];
  if (!carg) return null;
  const candidates: { name: string; id: string; party: string; votes: number; pct: number }[] = [];
  for (const agr of carg.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const c of par.cand ?? []) {
        const votes = Number(c.vap ?? 0);
        if (votes === 0) continue;
        candidates.push({
          name: c.nmu,
          id: c.sqcand ?? c.nmu,
          party: par.sg ?? '',
          votes,
          pct: parseFloat((c.pvap ?? '0').replace(',', '.')) || 0,
        });
      }
    }
  }
  candidates.sort((a, b) => b.votes - a.votes);
  return {
    race,
    uf,
    sections_counted: Number(raw.s?.st ?? 0),
    sections_total: Number(raw.s?.ts ?? 0),
    electors: Number(raw.v?.vvnom ? raw.v.vvnom : 0) || 0,
    valid: Number(raw.v?.vvc ?? 0),
    turnout: raw.v?.est ? parseFloat(raw.v.est) || 0 : 0,
    candidates: JSON.stringify(candidates.slice(0, 12)),
    status: raw.c?.at === 'S' ? 'final' : 'partial',
    fetched_at: Date.now(),
  };
}

/**
 * Free-tier budget (D1: 100k rows written/day, Workers: 50 subrequests/invocation):
 *  - presidente: BR + 27 UFs + exterior = 29 fetches, cron every 2 min
 *    -> 29 upserts + 1 history row per run = ~22k rows/day
 *  - estadual (governador + senador): 54 fetches, cron every 10 min
 *    -> 54 upserts per run = ~8k rows/day
 *  Total ~30k rows/day — comfortably inside the free tier.
 */
async function collectRace(env: Env, raceKeys: string[], withHistory: boolean): Promise<{ stored: number }> {
  const now = Date.now();
  const rows: SnapshotRow[] = [];

  for (const race of RACES) {
    if (!raceKeys.includes(race.key)) continue;
    const abrs: string[] = race.scope === 'br' ? ['BR', ...UFS] : [...UFS];
    const results = await Promise.allSettled(
      abrs.map((uf) =>
        fetchTse(`${TSE_BASE}/${race.election}/dados/${uf.toLowerCase()}/${uf.toLowerCase()}-c${race.cargo}-e${String(race.election).padStart(6, '0')}-u.json`),
      ),
    );
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        const row = normalize(r.value, race.key, abrs[i]);
        if (row) rows.push(row);
      }
    });
  }

  if (rows.length === 0) return { stored: 0 };

  const stmts = rows.map((r) =>
    env.DB.prepare(
      `INSERT INTO snapshots (race, uf, sections_counted, sections_total, electors, valid, turnout, candidates, status, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (race, uf) DO UPDATE SET
         sections_counted=excluded.sections_counted,
         sections_total=excluded.sections_total,
         electors=excluded.electors,
         valid=excluded.valid,
         turnout=excluded.turnout,
         candidates=excluded.candidates,
         status=excluded.status,
         fetched_at=excluded.fetched_at`,
    ).bind(r.race, r.uf, r.sections_counted, r.sections_total, r.electors, r.valid, r.turnout, r.candidates, r.status, now),
  );

  // history: append-only, only the national presidential race (1 row/run)
  if (withHistory) {
    const br = rows.find((r) => r.race === 'presidente' && r.uf === 'BR');
    if (br) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO history (ts, race, uf, sections_pct, candidates) VALUES (?, ?, ?, ?, ?)`,
        ).bind(now, 'presidente', 'BR', br.sections_total ? (br.sections_counted / br.sections_total) * 100 : 0, br.candidates),
      );
    }
  }

  await env.DB.batch(stmts);
  return { stored: rows.length };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/feed') {
      const { results } = await env.DB.prepare(
        `SELECT race, uf, sections_counted, sections_total, electors, valid, turnout, candidates, status, fetched_at
         FROM snapshots ORDER BY race, uf`,
      ).all();
      return Response.json(
        { ts: Date.now(), races: results },
        { headers: { 'cache-control': 'public, s-maxage=10, stale-while-revalidate=30' } },
      );
    }

    if (url.pathname === '/history') {
      const minutes = Math.min(Number(url.searchParams.get('minutes') ?? 60), 1440);
      const since = Date.now() - minutes * 60_000;
      const { results } = await env.DB.prepare(
        `SELECT ts, race, uf, sections_pct, candidates FROM history WHERE ts > ? ORDER BY ts`,
      ).bind(since).all();
      return Response.json({ points: results }, { headers: { 'cache-control': 'public, s-maxage=60' } });
    }

    if (url.pathname === '/collect' && req.method === 'POST') {
      const which = url.searchParams.get('race') ?? 'presidente';
      try {
        let out;
        if (which === 'estadual') {
          out = await collectRace(env, ['governador', 'senador'], false);
        } else if (which === 'turno2') {
          out = await collectRace(env, ['presidente2'], true);
        } else {
          out = await collectRace(env, ['presidente'], true);
        }
        return Response.json(out);
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    }

    return new Response('placar feed\n', { status: 200, headers: { 'content-type': 'text/plain' } });
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // cron expression tells us which pass this is
    const estadual = event.cron === '*/10 * * * *';
    if (estadual) await collectRace(env, ['governador', 'senador'], false);
    else await collectRace(env, ['presidente'], true);
  },
};
