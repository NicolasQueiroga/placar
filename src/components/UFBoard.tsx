import { memo, useMemo } from 'react';
import type { RaceData, UFProgress } from '../types';
import { partyColor } from '../tse';

const pct1 = (v: number) => v.toFixed(1).replace('.', ',');

/**
 * Placar por estado — one tile per UF, always visible. The viewer reads the
 * whole country in one glance; nothing is hidden behind interaction.
 * Sorted by electorate so the heavy states are where the eye starts.
 */
export const UFBoard = memo(function UFBoard({
  ufProgress,
  ufResults,
}: {
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
}) {
  const tiles = useMemo(() => {
    return [...ufProgress.values()]
      .map((u) => {
        const res = ufResults.get(u.uf);
        const leader = res?.candidates[0];
        const runnerUp = res?.candidates[1];
        return { u, leader, runnerUp };
      })
      .sort((a, b) => b.u.electorsTotal - a.u.electorsTotal);
  }, [ufProgress, ufResults]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))',
        gap: 6,
      }}
    >
      {tiles.map(({ u, leader, runnerUp }) => {
        const color = leader ? partyColor(leader.party, leader.coalition) : '#9E9E9E';
        const final = u.status === 'final';
        return (
          <div
            key={u.uf}
            style={{
              border: `1px solid ${final ? 'var(--green-urna)' : 'var(--line)'}`,
              borderRadius: 4,
              padding: '7px 9px',
              background: 'var(--bg-raised)',
              position: 'relative',
              overflow: 'hidden',
            }}
            aria-label={
              leader
                ? `${u.uf}: ${leader.ballotName} ${pct1(leader.percent)}%`
                : `${u.uf}: aguardando`
            }
          >
            {/* counting progress as a bottom fill — passive meter */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: 2,
                width: `${Math.min(100, u.percentSections)}%`,
                background: final ? 'var(--green-urna)' : 'var(--amber)',
                transition: 'width 700ms',
              }}
            />
            <div
              className="num"
              style={{ fontSize: 10, color: 'var(--text-faint)', display: 'flex', justifyContent: 'space-between' }}
            >
              <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{u.uf}</span>
              <span>{pct1(u.percentSections)}%</span>
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                marginTop: 3,
                color: leader ? color : 'var(--text-faint)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {leader ? leader.ballotName : '—'}
            </div>
            <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {leader ? (
                <>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{pct1(leader.percent)}%</span>
                  {runnerUp && (
                    <span style={{ color: 'var(--text-faint)' }}> · {pct1(runnerUp.percent)}%</span>
                  )}
                </>
              ) : (
                'aguardando'
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
