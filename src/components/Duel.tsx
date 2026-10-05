import { memo } from 'react';
import type { Candidate } from '../types';
import { partyColor } from '../tse';
import { CountUp } from './CountUp';

const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;

/**
 * The hero duel — two candidates facing each other across a center margin,
 * serif figures, run-ease bars beneath. The editorial front page of the app.
 */
export const Duel = memo(function Duel({
  a,
  b,
  runoff,
}: {
  a: Candidate;
  b: Candidate;
  runoff: boolean;
}) {
  const aColor = partyColor(a.party, a.coalition);
  const bColor = partyColor(b.party, b.coalition);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'end',
        gap: 'clamp(16px, 4vw, 48px)',
        marginTop: 18,
      }}
    >
      {/* left candidate */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'clamp(15px, 2vw, 21px)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.01em',
            color: aColor,
            lineHeight: 1.1,
          }}
        >
          {a.ballotName}
        </div>
        <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          {a.party} · <CountUp value={a.votes} />
        </div>
        <div
          className="fig"
          style={{ fontSize: 'clamp(44px, 6.5vw, 84px)', lineHeight: 1, marginTop: 8 }}
        >
          <CountUp value={a.percent} format={pct} />
        </div>
        <div
          className="bar-run"
          style={{
            height: 4,
            width: `${a.percent}%`,
            background: aColor,
            borderRadius: 2,
            marginTop: 10,
            maxWidth: '100%',
          }}
        />
      </div>

      {/* center margin */}
      <div
        style={{
          fontSize: 'clamp(18px, 2.4vw, 28px)',
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-serif)',
          paddingBottom: 'clamp(28px, 4.5vw, 56px)',
          whiteSpace: 'nowrap',
        }}
      >
        {runoff ? 'segundo turno' : '×'}
      </div>

      {/* right candidate — mirrored */}
      <div style={{ minWidth: 0, textAlign: 'right' }}>
        <div
          style={{
            fontSize: 'clamp(15px, 2vw, 21px)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.01em',
            color: bColor,
            lineHeight: 1.1,
          }}
        >
          {b.ballotName}
        </div>
        <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          <CountUp value={b.votes} /> · {b.party}
        </div>
        <div
          className="fig"
          style={{ fontSize: 'clamp(44px, 6.5vw, 84px)', lineHeight: 1, marginTop: 8 }}
        >
          <CountUp value={b.percent} format={pct} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div
            className="bar-run"
            style={{
              height: 4,
              width: `${b.percent}%`,
              background: bColor,
              borderRadius: 2,
              marginTop: 10,
              maxWidth: '100%',
            }}
          />
        </div>
      </div>
    </div>
  );
});
