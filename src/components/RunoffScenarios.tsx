import { memo } from 'react';
import type { Candidate, RaceData } from '../types';
import { buildScenarios, RUNOFF_REFERENCES, LEADER_RUNOFF_RECORD } from '../scenarios';
import { partyColor } from '../tse';

const pct1 = (v: number) => v.toFixed(1).replace('.', ',');

/** Duel bar: both finalists' shares in one bar meeting at the split, 50% tick. */
function DuelBar({
  a,
  aShare,
  b,
  bShare,
}: {
  a: Candidate;
  aShare: number;
  b: Candidate;
  bShare: number;
}) {
  const aColor = partyColor(a.party, a.coalition);
  const bColor = partyColor(b.party, b.coalition);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: aColor, fontWeight: 700 }}>
          {a.ballotName} {pct1(aShare)}%
        </span>
        <span style={{ color: bColor, fontWeight: 700 }}>
          {b.ballotName} {pct1(bShare)}%
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 18,
          background: 'var(--bg-hover)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${aShare}%`,
            background: aColor,
            transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${bShare}%`,
            background: bColor,
            transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        {/* 50% tick */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--bg)',
          }}
        />
      </div>
    </div>
  );
}

export const RunoffScenarios = memo(function RunoffScenarios({ national }: { national: RaceData }) {
  const scenarios = buildScenarios(national);
  if (scenarios.length === 0) return null;
  const a = national.candidates[0];
  const b = national.candidates[1];

  return (
    <section style={{ marginTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '-0.01em',
          }}
        >
          O 2º turno
        </h2>
        <span className="num" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          25 de outubro · cenários com base no 1º turno oficial
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          marginTop: 16,
        }}
      >
        {scenarios.map((s) => (
          <article
            key={s.key}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '14px 16px',
              background: 'var(--bg-raised)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 8,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{s.title}</h3>
              <span
                className="num"
                style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'right' }}
              >
                {s.precedent}
              </span>
            </div>
            <DuelBar a={a} aShare={s.aShare} b={b} bShare={s.bShare} />
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--text-dim)' }}>
              {s.rationale}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
});

/** Historical strip: every runoff since 1989, winner's 1st → runoff share. */
export const RunoffHistory = memo(function RunoffHistory() {
  return (
    <div style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        2ºs turnos presidenciais — 1º turno → 2º turno (vencedor)
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
        }}
      >
        {RUNOFF_REFERENCES.map((r) => {
          const gain = r.runoff - r.first;
          return (
            <div
              key={r.year}
              style={{
                border: '1px solid var(--line-soft)',
                borderRadius: 4,
                padding: '9px 11px',
                background: 'var(--bg)',
              }}
            >
              <div
                className="num"
                style={{
                  fontSize: 10,
                  color: 'var(--text-faint)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{r.year}</span>
                <span>
                  {gain >= 0 ? '+' : ''}
                  {pct1(gain)} p.p.
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{r.winner}</div>
              <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {pct1(r.first)}% → {pct1(r.runoff)}%
              </div>
            </div>
          );
        })}
      </div>
      <p
        className="num"
        style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.6 }}
      >
        Em {LEADER_RUNOFF_RECORD} disputas desde 1989, o líder do 1º turno venceu o 2º. Mas a margem
        final caiu de +14,9 p.p. (2002) a +1,8 p.p. (2022) — margens de ~2 p.p. como a de hoje são
        genuinamente disputáveis.
      </p>
    </div>
  );
});
