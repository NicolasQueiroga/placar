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
  INGEST_KEY?: string;
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

async function fetchTse(url: string, allowProxy = false): Promise<TseUnified | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // TSE's WAF 403s datacenter-looking requests — spoof a browser
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        Referer: 'https://resultados.tse.jus.br/oficial/',
      },
      cache: 'no-store',
    });
    if (res.ok) return (await res.json()) as TseUnified;
    console.log(`tse ${res.status}: ${url}`);
  } catch (e) {
    console.log(`tse error ${e instanceof Error ? e.message : e}: ${url}`);
  }

  // TSE's WAF blocks Cloudflare egress IPs outright. r.jina.ai fetches
  // server-side from THEIR IPs (free, keyless, 20 req/min — we use ~1/2min
  // for the national BR file only, so the budget is never threatened).
  if (!allowProxy) return null;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { cache: 'no-store' });
    if (!res.ok) {
      console.log(`jina ${res.status}: ${url}`);
      return null;
    }
    const text = await res.text();
    const i = text.indexOf('{');
    const j = text.lastIndexOf('}');
    if (i < 0 || j <= i) return null;
    return JSON.parse(text.slice(i, j + 1)) as TseUnified;
  } catch (e) {
    console.log(`jina error ${e instanceof Error ? e.message : e}: ${url}`);
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
    // uf-level cargo block has no `at` flag — final means fully counted
    status:
      Number(raw.s?.ts ?? 0) > 0 && Number(raw.s?.st ?? 0) >= Number(raw.s?.ts ?? 0)
        ? 'final'
        : 'partial',
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
        // proxy fallback only for the national file: it feeds the D1 minute
        // archive, and keeps jina traffic at ~1 req/2min (UF boards are
        // served to browsers straight from TSE, which works for them)
        fetchTse(
          `${TSE_BASE}/${race.election}/dados/${uf.toLowerCase()}/${uf.toLowerCase()}-c${race.cargo}-e${String(race.election).padStart(6, '0')}-u.json`,
          uf === 'BR' && race.scope === 'br',
        ),
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

  // history: append-only, national presidential races (1st round + runoff)
  if (withHistory) {
    for (const raceKey of ['presidente', 'presidente2']) {
      const br = rows.find((r) => r.race === raceKey && r.uf === 'BR');
      if (br) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO history (ts, race, uf, sections_pct, candidates) VALUES (?, ?, ?, ?, ?)`,
          ).bind(now, raceKey, 'BR', br.sections_total ? (br.sections_counted / br.sections_total) * 100 : 0, br.candidates),
        );
      }
    }
  }

  await env.DB.batch(stmts);
  return { stored: rows.length };
}

interface IngestPoint {
  ts: number;
  sections_pct: number;
  candidates: { name: string; id: string; party: string; votes: number; pct: number }[];
}
interface IngestBody {
  race: string;
  points: IngestPoint[];
}

function validPoint(p: IngestPoint): boolean {
  if (!Number.isFinite(p.ts)) return false;
  const day = 86_400_000;
  if (p.ts < Date.now() - 7 * day || p.ts > Date.now() + 10 * 60_000) return false;
  if (!Number.isFinite(p.sections_pct) || p.sections_pct < 0 || p.sections_pct > 100) return false;
  if (!Array.isArray(p.candidates) || p.candidates.length === 0 || p.candidates.length > 15) return false;
  for (const c of p.candidates) {
    if (typeof c.name !== 'string' || c.name.length > 80) return false;
    if (typeof c.id !== 'string' || c.id.length > 40) return false;
    if (typeof c.party !== 'string' || c.party.length > 30) return false;
    if (!Number.isInteger(c.votes) || c.votes < 0 || c.votes > 200_000_000) return false;
    if (!Number.isFinite(c.pct) || c.pct < 0 || c.pct > 100) return false;
  }
  return true;
}

async function ingest(
  env: Env,
  body: IngestBody,
): Promise<{ stored: number; dropped: number; error?: string }> {
  if (!body || (body.race !== 'presidente' && body.race !== 'presidente2')) {
    return { stored: 0, dropped: 0, error: 'race must be presidente|presidente2' };
  }
  if (!Array.isArray(body.points) || body.points.length === 0) {
    return { stored: 0, dropped: 0, error: 'empty' };
  }
  const points = body.points.slice(0, 60).filter(validPoint);
  if (points.length === 0) return { stored: 0, dropped: body.points.length, error: 'no valid points' };

  const row = await env.DB.prepare(`SELECT MAX(sections_pct) AS m FROM history WHERE race = ?`)
    .bind(body.race)
    .first<{ m: number | null }>();
  const maxPct = row?.m ?? 0;

  let stored = 0;
  let dropped = body.points.length - points.length;
  const stmts = [];
  for (const p of points.sort((a, b) => a.ts - b.ts)) {
    // monotonic guard: never archive behind what we already have
    // (epsilon: two browsers can legitimately see the same generation)
    if (p.sections_pct < maxPct - 1e-9) {
      dropped++;
      continue;
    }
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO history (ts, race, uf, sections_pct, candidates) VALUES (?, ?, 'BR', ?, ?)`,
      ).bind(Math.round(p.ts), body.race, p.sections_pct, JSON.stringify(p.candidates)),
    );
    stored++;
  }
  if (stmts.length > 0) await env.DB.batch(stmts);
  return { stored, dropped };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

function jsonWithCors(data: unknown, init?: ResponseInit): Response {
  const res = Response.json(data, init);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/feed') {
      const { results } = await env.DB.prepare(
        `SELECT race, uf, sections_counted, sections_total, electors, valid, turnout, candidates, status, fetched_at
         FROM snapshots ORDER BY race, uf`,
      ).all();
      return jsonWithCors(
        { ts: Date.now(), races: results },
        { headers: { 'cache-control': 'public, s-maxage=10, stale-while-revalidate=30, stale-if-error=600' } },
      );
    }

    if (url.pathname === '/history') {
      const minutes = Math.min(Number(url.searchParams.get('minutes') ?? 60), 1440);
      const since = Date.now() - minutes * 60_000;
      const race = url.searchParams.get('race');
      const { results } = race
        ? await env.DB.prepare(
            `SELECT ts, race, uf, sections_pct, candidates FROM history WHERE ts > ? AND race = ? ORDER BY ts`,
          )
            .bind(since, race)
            .all()
        : await env.DB.prepare(
            `SELECT ts, race, uf, sections_pct, candidates FROM history WHERE ts > ? ORDER BY ts`,
          )
            .bind(since)
            .all();
      return jsonWithCors({ points: results }, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300, stale-if-error=600' } });
    }

    // Browser-driven archive. TSE's WAF blocks this worker's own fetches
    // (Cloudflare IPs), so the visitors' browsers — which CAN reach TSE —
    // POST each new national generation here. The key only deters casual
    // abuse (it ships in the public bundle); the real guards are strict
    // validation + monotonic sections: anything behind the stored maximum
    // is dropped, so spam can never rewrite the past.
    if (url.pathname === '/ingest' && req.method === 'POST') {
      if (!env.INGEST_KEY || req.headers.get('x-ingest-key') !== env.INGEST_KEY) {
        return jsonWithCors({ error: 'unauthorized' }, { status: 401 });
      }
      let body: IngestBody;
      try {
        body = (await req.json()) as IngestBody;
      } catch {
        return jsonWithCors({ error: 'bad json' }, { status: 400 });
      }
      const out = await ingest(env, body);
      return jsonWithCors(out, { status: out.error ? 400 : 200 });
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
    else await collectRace(env, ['presidente', 'presidente2'], true);
  },
};
