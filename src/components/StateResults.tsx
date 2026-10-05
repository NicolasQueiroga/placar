import { memo, useMemo } from 'react';
import type { Candidate, RaceData, UFProgress } from '../types';
import { partyColor } from '../tse';

const pct1 = (v: number) => v.toFixed(1).replace('.', ',');

type RowKind = 'runoff' | 'plurality'; // governador vs senador/dep.federal

interface StateRow {
  uf: string;
  electors: number;
  nearDone: boolean;
  top: Candidate[]; // leader first; for plurality races, top-2
}

/**
 * Per-state results for uf-scoped races. These are 27 independent races —
 * a national sum would be meaningless. Outcome language per race kind:
 *  - runoff races (governador): 1º TURNO (>50%) or 2º TURNO chips
 *  - plurality races (senador, dep.federal): top-2 shown, no threshold chips
 */
export const StateResults = memo(function StateResults({
  ufProgress,
  ufResults,
  kind,
}: {
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
  kind: RowKind;
}) {
  const rows = useMemo<StateRow[]>(
    () =>
      [...ufProgress.values()]
        .map((u) => {
          const res = ufResults.get(u.uf);
          const nearDone = u.percentSections >= 99.9 || u.status === 'final';
          return {
            uf: u.uf,
            electors: u.electorsTotal,
            nearDone,
            top: res?.candidates.slice(0, 2) ?? [],
          };
        })
        .sort((a, b) => b.electors - a.electors),
    [ufProgress, ufResults],
  );

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map(({ uf, nearDone, top }) => {
        const [leader, second] = top;
        const color = leader ? partyColor(leader.party, leader.coalition) : 'var(--text-faint)';
        const decided = leader && nearDone && leader.percent > 50;
        return (
          <li
            key={uf === 'ZZ' ? 'EX' : uf}
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
              {uf === 'ZZ' ? 'EX' : uf}
            </span>
            <div style={{ minWidth: 0 }}>
              {kind === 'runoff' ? (
                /* governador: leader + runner-up share */
                <>
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
                    {leader
                      ? `${leader.party}${second ? ` · ${pct1(second.percent)}% ${second.ballotName}` : ''}`
                      : ''}
                  </div>
                </>
              ) : (
                /* senador/dep.federal: top-2 side by side — both may be elected */
                <div style={{ display: 'flex', gap: 12, minWidth: 0, flexWrap: 'wrap' }}>
                  {top.map((c, i) => (
                    <div key={c.id} style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: i === 0 ? 700 : 500,
                          color: i === 0 ? partyColor(c.party, c.coalition) : 'var(--text-dim)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {c.ballotName}
                      </div>
                      <div className="num" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
                        {c.party} · {pct1(c.percent)}%
                      </div>
                    </div>
                  ))}
                  {top.length === 0 && (
                    <div className="num" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                      aguardando
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                {leader ? `${pct1(leader.percent)}%` : '—'}
              </div>
              {kind === 'runoff' && nearDone && leader && (
                <div
                  className="num"
                  style={{
                    fontSize: 9,
                    marginTop: 2,
                    color: decided ? 'var(--green-urna)' : 'var(--runoff)',
                  }}
                >
                  {decided ? '1º TURNO' : '2º TURNO'}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
});
