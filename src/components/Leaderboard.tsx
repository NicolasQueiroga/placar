import { memo } from 'react';
import type { Candidate, RaceData } from '../types';
import { partyColor } from '../tse';
import { CountUp } from './CountUp';

const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;

export const Leaderboard = memo(function Leaderboard({
  national,
  compact = false,
}: {
  national: RaceData;
  compact?: boolean;
}) {
  const max = national.candidates[0]?.percent || 1;
  const totalValid = national.validVotes || 1;

  return (
    <ol className="leaderboard" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {national.candidates.map((c, i) => (
        <Row key={c.id} c={c} rank={i + 1} max={max} totalValid={totalValid} compact={compact} />
      ))}
    </ol>
  );
});

const Row = memo(function Row({
  c,
  rank,
  max,
  totalValid,
  compact,
}: {
  c: Candidate;
  rank: number;
  max: number;
  totalValid: number;
  compact: boolean;
}) {
  const color = partyColor(c.party, c.coalition);
  const width = `${(c.percent / max) * 100}%`;
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '24px 1fr auto' : '28px 1fr auto',
        gap: '12px',
        alignItems: 'center',
        padding: compact ? '8px 0' : '12px 0',
        borderTop: '1px solid var(--line-soft)',
      }}
    >
      <span
        className="num"
        style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}
      >
        {rank}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: compact ? 14 : 16,
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
            }}
          >
            {c.ballotName}
          </span>
          <span className="num" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {c.number} · {c.party}
          </span>
          {c.elected && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--green-urna)',
                border: '1px solid var(--green-urna)',
                padding: '1px 6px',
                borderRadius: 2,
              }}
            >
              ELEITO
            </span>
          )}
        </div>
        {!compact && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            {c.coalition}
            {c.runningMate ? ` · vice: ${c.runningMate}` : ''}
          </div>
        )}
        {/* Vote bar */}
        <div
          style={{
            marginTop: 6,
            height: compact ? 4 : 6,
            background: 'var(--bg-raised)',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width,
              height: '100%',
              background: color,
              transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="fig" style={{ fontSize: compact ? 19 : 22, lineHeight: 1.05 }}>
          <CountUp value={c.percent} format={pct} />
        </div>
        <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          <CountUp value={c.votes} />
        </div>
        {!compact && (
          <div className="num" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            {((c.votes / totalValid) * 100).toFixed(1)}% válidos
          </div>
        )}
      </div>
    </li>
  );
});
