import { memo, useMemo } from 'react';
import type { RaceData, UFProgress } from '../types';
import { partyColor } from '../tse';

const pct1 = (v: number) => v.toFixed(1).replace('.', ',');

/**
 * Per-state results for uf-scoped races (governador, senador, dep. federal).
 * These are 27 independent races — a national sum would be meaningless,
 * so each state gets its own row: leader, runner-up, and outcome chip.
 */
export const StateResults = memo(function StateResults({
  ufProgress,
  ufResults,
  runoff,
}: {
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
  runoff: boolean; // race can go to a 2nd round (governador)
}) {
  const rows = useMemo(() => {
    return [...ufProgress.values()]
      .map((u) => {
        const res = ufResults.get(u.uf);
        const leader = res?.candidates[0];
        const runnerUp = res?.candidates[1];
        const counted = u.percentSections;
        const nearDone = counted >= 99.9 || u.status === 'final';
        return { u, leader, runnerUp, nearDone };
      })
      .sort((a, b) => b.u.electorsTotal - a.u.electorsTotal);
  }, [ufProgress, ufResults]);

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map(({ u, leader, runnerUp, nearDone }) => {
        const color = leader ? partyColor(leader.party, leader.coalition) : 'var(--text-faint)';
        // outcome: only meaningful when counting is (near) complete
        const decided = leader && nearDone && leader.percent > 50;
        const runoffState = runoff && leader && nearDone && leader.percent <= 50;
        return (
          <li
            key={u.uf}
            style={{
              display: 'grid',
              gridTemplateColumns: '34px 1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '9px 0',
              borderTop: '1px solid var(--line-soft)',
            }}
          >
            <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
              {u.uf}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: leader ? color : 'var(--text-faint)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {leader ? leader.ballotName : 'aguardando'}
              </div>
              <div className="num" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
                {leader ? `${leader.party}${runnerUp ? ` · ${pct1(runnerUp.percent)}% ${runnerUp.ballotName}` : ''}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                {leader ? `${pct1(leader.percent)}%` : '—'}
              </div>
              {nearDone && leader && (
                <div
                  className="num"
                  style={{
                    fontSize: 9,
                    marginTop: 2,
                    color: decided ? 'var(--green-urna)' : runoffState ? 'var(--runoff)' : 'var(--text-faint)',
                  }}
                >
                  {decided ? '1º TURNO' : runoffState ? '2º TURNO' : ''}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
});
