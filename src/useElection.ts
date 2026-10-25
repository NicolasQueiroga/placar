import { useCallback, useEffect, useRef, useState } from 'react';
import { ELECTIONS, fetchAcompanhamento, fetchNational, fetchUF, forecastSecondRound, RACES } from './tse';
import { fetchFeed } from './feed';
import type { RaceKey } from './tse';
import type { RaceData, SecondRoundForecast, UFProgress } from './types';

const POLL_MS = 15_000;

export interface LiveState {
  national: RaceData | null;
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>; // per-UF results for the active race
  forecast: SecondRoundForecast | null;
  lastUpdated: number | null;
  error: string | null;
  loading: boolean;
  race: (typeof RACES)[number];
  turno: 1 | 2; // presidential only: 1st vs 2nd round election code
  setTurno: (t: 1 | 2) => void;
  setRace: (key: RaceKey) => void;
  refresh: () => void;
}

export function useElection(): LiveState {
  const [raceKey, setRaceKey] = useState<RaceKey>('presidente');
  // runoff day default: land on the 2nd round (flip back to 1 after Oct 2026)
  const [turno, setTurno] = useState<1 | 2>(2);
  const race = RACES.find((r) => r.key === raceKey) ?? RACES[0];
  // runoffs run under their own election codes — presidential (6258) AND
  // gubernatorial (6260: AC, AM, DF, ES, RN, TO). senador/dep.federal are
  // single-round: they always read the 1º-turno election
  const election =
    race.key === 'presidente' && turno === 2
      ? ELECTIONS.presidente2
      : race.key === 'governador' && turno === 2
        ? ELECTIONS.estadual2
        : race.election;
  // acompanhamento (UF progress) for the uf-scoped direct path: 6260 lists
  // only the 6 runoff states — exactly what should be fetched on turno 2
  const abElection =
    race.scope === 'br'
      ? election
      : race.key === 'governador' && turno === 2
        ? ELECTIONS.estadual2
        : ELECTIONS.estadual1;
  const [national, setNational] = useState<RaceData | null>(null);
  const [ufProgress, setUfProgress] = useState<Map<string, UFProgress>>(new Map());
  const [ufResults, setUfResults] = useState<Map<string, RaceData>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const tick = useCallback(async () => {
    setError(null);
    try {
      // Fast path: worker feed — 1 request for per-UF candidates.
      // Worker polls TSE on cron (2 min) so browser load is tiny.
      // Caveats: feed rows carry no electorate stats (electors/turnout/
      // blank/null are zero) and no UF progress — so the national file and
      // the acompanhamento still come direct from TSE (ETag-cached, cheap).
      // Only br-scoped races use the feed; uf-scoped go fully direct.
      const feed = await fetchFeed();
      if (feed && feed.rows.size > 0 && race.scope === 'br') {
        const feedRaceKey =
          race.key === 'presidente' && turno === 2 ? 'presidente2' : race.key;
        const prefix = `${feedRaceKey}:`;
        const perUf = new Map<string, RaceData>();
        for (const [key, data] of feed.rows) {
          if (!key.startsWith(prefix)) continue;
          const uf = key.slice(prefix.length);
          perUf.set(uf, data);
        }
        // Staleness guard: when TSE blocks the worker (its WAF hates
        // Cloudflare IPs), feed rows freeze — a "fresh-looking" board of
        // yesterday's zeros. Only trust rows the worker collected in the
        // last 10 min; otherwise fall through to the fully-direct path,
        // which works from browsers.
        const freshUfs = [...perUf.values()].filter(
          (d) => Date.now() - Date.parse(d.generatedAt) < 10 * 60_000,
        ).length;
        if (perUf.size > 0 && freshUfs >= 27) {
          setUfResults(perUf);
          const [ab, nat] = await Promise.allSettled([
            fetchAcompanhamento(election),
            fetchNational(election, race.cargo),
          ]);
          if (ab.status === 'fulfilled' && ab.value.length > 0) {
            setUfProgress(new Map(ab.value.map((u) => [u.uf, u])));
          } else {
            // degrade: synthesize progress from the feed's section counts
            setUfProgress(
              new Map(
                [...perUf.entries()]
                  .filter(([uf]) => uf !== 'BR' && uf !== 'ZZ')
                  .map(([uf, d]) => [
                    uf,
                    {
                      uf,
                      status: d.status,
                      percentSections:
                        d.sectionsTotal > 0 ? (d.sectionsCounted / d.sectionsTotal) * 100 : 0,
                      electorsTotal: d.electorsTotal,
                      electorsCounted: 0,
                      updatedAt: d.generatedAt,
                    } satisfies UFProgress,
                  ]),
              ),
            );
          }
          if (nat.status === 'fulfilled') setNational(nat.value);
          else setNational((prev) => prev ?? perUf.get('BR') ?? null);
          if (mounted.current) setLastUpdated(Date.now());
          return; // feed + direct national served everything
        }
      }

      // Fallback: direct TSE (worker unreachable or empty)
      // Acompanhamento (EA14) — one file per election
      const ab = await fetchAcompanhamento(abElection).catch(() => null);
      const ufs = ab ?? [];
      if (ufs.length > 0) setUfProgress(new Map(ufs.map((u) => [u.uf, u])));

      // Per-UF results for the active race (ETag-cached after first load)
      // Presidente also has the exterior vote (cdabr 'zz')
      const ufList = [...ufs];
      if (race.scope === 'br' && !ufList.some((u) => u.uf === 'ZZ')) {
        ufList.push({
          uf: 'ZZ',
          status: 'partial',
          percentSections: 0,
          electorsTotal: 0,
          electorsCounted: 0,
          updatedAt: '',
        });
      }
      const results = await Promise.allSettled(
        ufList.map((u) => fetchUF(u.uf, election, race.cargo)),
      );
      const newResults = new Map<string, RaceData>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) newResults.set(ufList[i].uf, r.value);
      });
      if (newResults.size > 0) {
        setUfResults((prev) => {
          const merged = new Map(prev);
          for (const [k, v] of newResults) merged.set(k, v);
          return merged;
        });
      }

      // National file only exists for presidente
      if (race.scope === 'br') {
        try {
          const nat = await fetchNational(election, race.cargo);
          setNational(nat);
        } catch (e) {
          if ((e as Error).message !== 'unchanged') setError((e as Error).message);
        }
      } else {
        // For uf-scoped races, synthesize a national view by summing UF results
        const all = [...newResults.values()];
        if (all.length > 0) {
          setNational(() => {
            const base = all[0];
            const byId = new Map<string, { votes: number; c: RaceData['candidates'][number] }>();
            for (const r of all) {
              for (const c of r.candidates) {
                const e = byId.get(c.id);
                if (e) e.votes += c.votes;
                else byId.set(c.id, { votes: c.votes, c });
              }
            }
            const candidates = [...byId.values()]
              .sort((a, b) => b.votes - a.votes)
              .map(({ votes, c }) => ({ ...c, votes, percent: 0 }));
            const validVotes = all.reduce((acc, r) => acc + r.validVotes, 0);
            for (const c of candidates) c.percent = validVotes > 0 ? (c.votes / validVotes) * 100 : 0;
            return {
              ...base,
              candidates,
              validVotes,
              status: base.status,
              sectionsTotal: all.reduce((a, r) => a + r.sectionsTotal, 0),
              sectionsCounted: all.reduce((a, r) => a + r.sectionsCounted, 0),
              electorsTotal: all.reduce((a, r) => a + r.electorsTotal, 0),
              electorsCounted: all.reduce((a, r) => a + r.electorsCounted, 0),
              turnout: all.reduce((a, r) => a + r.turnout, 0),
              abstention: all.reduce((a, r) => a + r.abstention, 0),
              blank: all.reduce((a, r) => a + r.blank, 0),
              nullVotes: all.reduce((a, r) => a + r.nullVotes, 0),
            } satisfies RaceData;
          });
        }
      }
      if (mounted.current) setLastUpdated(Date.now());
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [race, turno, election, abElection]);

  useEffect(() => {
    mounted.current = true;
    // reset per-race/turno state
    setNational(null);
    setUfResults(new Map());
    setLoading(true);
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [tick, turno]);

  const forecast =
    national && race.runoff && turno === 1
      ? forecastSecondRound(national, [...ufProgress.values()], ufResults)
      : null;

  return {
    national,
    ufProgress,
    ufResults,
    forecast,
    lastUpdated,
    error,
    loading,
    race,
    turno,
    setTurno,
    setRace: setRaceKey,
    refresh: () => {
      setLoading(true);
      tick();
    },
  };
}
