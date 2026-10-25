import { memo, type ReactNode } from 'react';
import type { Candidate } from '../types';
import { partyColor } from '../tse';
import { CountUp } from './CountUp';

const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;

/** Reserve wrapping space without mounting hidden animated counters. */
export function ReservedCopy({ children, alternatives = [] }: {
  children: ReactNode;
  alternatives?: readonly string[];
}) {
  return (
    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0, overflowWrap: 'anywhere' }}>
      {alternatives.map((text, i) => (
        <span key={i} aria-hidden style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{text}</span>
      ))}
      <span style={{ gridArea: '1 / 1' }}>{children}</span>
    </span>
  );
}

/**
 * The hero duel — two candidates facing each other across a center margin,
 * serif figures, run-ease bars beneath. The editorial front page of the app.
 */
export const Duel = memo(function Duel({
  a,
  b,
  runoff,
  reserveCandidates,
}: {
  a: Candidate;
  b: Candidate;
  runoff: boolean;
  reserveCandidates?: readonly Candidate[];
}) {
  const names = reserveCandidates?.map((c) => c.ballotName);
  const leftMeta = reserveCandidates?.map((c) => `${c.party} · ${c.votes.toLocaleString('pt-BR')}`);
  const rightMeta = reserveCandidates?.map((c) => `${c.votes.toLocaleString('pt-BR')} · ${c.party}`);
  const reserveRunoff = reserveCandidates?.some((c) => c.runoff);
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
          <ReservedCopy alternatives={names}>{a.ballotName}</ReservedCopy>
        </div>
        <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          <ReservedCopy alternatives={leftMeta}>{a.party} · <CountUp value={a.votes} /></ReservedCopy>
        </div>
        <div
          className="fig"
          style={{ fontSize: 'clamp(30px, 8.5vw, 84px)', lineHeight: 1, marginTop: 8 }}
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
          fontSize: 'clamp(12px, 2.4vw, 28px)',
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-serif)',
          paddingBottom: 'clamp(20px, 4.5vw, 56px)',
          whiteSpace: 'nowrap',
        }}
      >
        <ReservedCopy alternatives={reserveRunoff ? ['2º turno'] : undefined}>
          {runoff ? '2º turno' : '×'}
        </ReservedCopy>
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
          <ReservedCopy alternatives={names}>{b.ballotName}</ReservedCopy>
        </div>
        <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          <ReservedCopy alternatives={rightMeta}><CountUp value={b.votes} /> · {b.party}</ReservedCopy>
        </div>
        <div
          className="fig"
          style={{ fontSize: 'clamp(30px, 8.5vw, 84px)', lineHeight: 1, marginTop: 8 }}
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
