import { useCallback, useEffect, useRef, useState } from 'react';
import { ELECTIONS, fetchAcompanhamento, fetchNational, fetchUF, forecastSecondRound, RACES } from './tse';
import type { RaceKey } from './tse';
import type { RaceData, SecondRoundForecast, UFProgress } from './types';

const POLL_MS = 30_000;

export interface LiveState {
  national: RaceData | null;
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>; // per-UF results for the active race
  forecast: SecondRoundForecast | null;
  lastUpdated: number | null;
  error: string | null;
  loading: boolean;
  race: (typeof RACES)[number];
  setRace: (key: RaceKey) => void;
  refresh: () => void;
}

export function useElection(): LiveState {
  const [raceKey, setRaceKey] = useState<RaceKey>('presidente');
  const race = RACES.find((r) => r.key === raceKey) ?? RACES[0];
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
      // Acompanhamento (EA14) — same file for the whole estadual election
      const ab = await fetchAcompanhamento(
        race.scope === 'br' ? ELECTIONS.presidente1 : ELECTIONS.estadual1,
      ).catch(() => null);
      const ufs = ab ?? [];
      if (ufs.length > 0) setUfProgress(new Map(ufs.map((u) => [u.uf, u])));

      // Per-UF results for the active race (ETag-cached after first load)
      const results = await Promise.allSettled(
        ufs.map((u) => fetchUF(u.uf, race.election, race.cargo)),
      );
      const newResults = new Map<string, RaceData>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) newResults.set(ufs[i].uf, r.value);
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
          const nat = await fetchNational(race.election, race.cargo);
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
  }, [race]);

  useEffect(() => {
    mounted.current = true;
    // reset per-race state
    setNational(null);
    setUfResults(new Map());
    setLoading(true);
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [tick]);

  const forecast =
    national && race.runoff ? forecastSecondRound(national, [...ufProgress.values()], ufResults) : null;

  return {
    national,
    ufProgress,
    ufResults,
    forecast,
    lastUpdated,
    error,
    loading,
    race,
    setRace: setRaceKey,
    refresh: () => {
      setLoading(true);
      tick();
    },
  };
}
