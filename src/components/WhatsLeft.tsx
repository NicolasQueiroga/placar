import { memo, useMemo } from 'react';
import type { RaceData, UFProgress } from '../types';
import { partyColor } from '../tse';
import { DuelBar } from './RunoffScenarios';

const pct1 = (v: number) => v.toFixed(1).replace('.', ',');
const mi = (v: number) => `${(v / 1e6).toFixed(1).replace('.', ',')} mi`;

const REGIONS: { name: string; ufs: string[] }[] = [
  { name: 'Norte', ufs: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'] },
  { name: 'Nordeste', ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { name: 'Centro-Oeste', ufs: ['DF', 'GO', 'MS', 'MT'] },
  { name: 'Sudeste', ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { name: 'Sul', ufs: ['PR', 'RS', 'SC'] },
];

export interface RegionAgg {
  name: string;
  electors: number;
  countedPct: number; // 0-1, elector-weighted
  aShare: number; // national leader's share of valid votes, 0-100
  bShare: number;
  remaining: number; // electors not yet counted
}

export interface Outlook {
  regions: RegionAgg[];
  projA: number; // projected final national share of valid, 0-100
  projB: number;
  topRegion: RegionAgg; // biggest remaining bloc
}

/**
 * Aggregate "what's left" per region + project the final national split.
 * Candidates are matched by BALLOT NUMBER, not array position — a UF file
 * lists that state's own leader first, which flips from state to state.
 * (Feed rows carry no ballot number, so fall back to party — unique in a
 * two-candidate race.)
 *
 * Projection: votes already counted + each region's remaining electors
 * split by the region's CURRENT shares. Honest, and it converges to the
 * final result as counting completes.
 */
export function buildOutlook(
  national: RaceData,
  ufProgress: Map<string, UFProgress>,
  ufResults: Map<string, RaceData>,
): Outlook | null {
  const a = national.candidates[0];
  const b = national.candidates[1];
  if (!a || !b) return null;

  const regions: RegionAgg[] = REGIONS.map((reg) => {
    let electors = 0;
    let countedW = 0;
    let aW = 0;
    let bW = 0;
    for (const uf of reg.ufs) {
      const p = ufProgress.get(uf);
      const r = ufResults.get(uf);
      const el = p?.electorsTotal ?? r?.electorsTotal ?? 0;
      const pct = Math.min(1, Math.max(0, (p?.percentSections ?? 0) / 100));
      const match = (c: { number: string; party: string }, ref: { number: string; party: string }) =>
        c.number === ref.number || c.party === ref.party;
      const ca = r?.candidates.find((c) => match(c, a));
      const cb = r?.candidates.find((c) => match(c, b));
      electors += el;
      countedW += el * pct;
      aW += el * (ca?.percent ?? 0);
      bW += el * (cb?.percent ?? 0);
    }
    return {
      name: reg.name,
      electors,
      countedPct: electors > 0 ? countedW / electors : 0,
      aShare: electors > 0 ? aW / electors : 0,
      bShare: electors > 0 ? bW / electors : 0,
      remaining: electors - countedW,
    };
  });

  let finalA = a.votes;
  let finalB = b.votes;
  for (const r of regions) {
    if (r.countedPct <= 0 || r.countedPct >= 0.999) continue;
    finalA += (r.remaining * r.aShare) / 100;
    finalB += (r.remaining * r.bShare) / 100;
  }
  const total = finalA + finalB;
  const natValid = Math.max(a.votes + b.votes, 1);
  const projA = total > 0 ? (finalA / total) * 100 : (a.votes / natValid) * 100;
  const projB = total > 0 ? (finalB / total) * 100 : (b.votes / natValid) * 100;

  const topRegion = [...regions].sort((x, y) => y.remaining - x.remaining)[0];
  return { regions, projA, projB, topRegion };
}

/**
 * "O que falta apurar" — the election-night question on the 2º turno:
 * where the uncounted vote sits and who it favors. Replaces the 1º-turno
 * scenario cards (predictions for an event that is now live).
 */
export const WhatsLeft = memo(function WhatsLeft({
  national,
  ufProgress,
  ufResults,
}: {
  national: RaceData;
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
}) {
  const outlook = useMemo(
    () => buildOutlook(national, ufProgress, ufResults),
    [national, ufProgress, ufResults],
  );
  const a = national.candidates[0];
  const b = national.candidates[1];
  if (!outlook || !a || !b) return null;

  const started = national.sectionsCounted > 0;
  const { topRegion, regions } = outlook;
  const aColor = partyColor(a.party, a.coalition);
  const bColor = partyColor(b.party, b.coalition);
  const totalElectors = regions.reduce((s, r) => s + r.electors, 0);
  const topLeaderIsA = topRegion.aShare >= topRegion.bShare;

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
          O que falta apurar
        </h2>
        <span className="num" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {started
            ? 'onde está o voto restante — e quem ele favorece'
            : 'o mapa da noite: quanto cada região pesa no eleitorado'}
        </span>
      </div>

      {/* projection banner — only once real sections exist */}
      {started && (
        <article
          style={{
            marginTop: 16,
            border: '1px solid var(--line)',
            borderRadius: 6,
            padding: '14px 16px',
            background: 'var(--bg-raised)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Se cada estado terminar como está agora</h3>
            <span className="num" style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'right' }}>
              projeção, não resultado oficial
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <DuelBar a={a} aShare={outlook.projA} b={b} bShare={outlook.projB} />
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--text-dim)' }}>
            A maior fatia por apurar está em{' '}
            <strong style={{ color: 'var(--text)' }}>{topRegion.name}</strong> (~{mi(topRegion.remaining)} de
            eleitores)
            {topRegion.aShare > 0 && (
              <>
                , onde {topLeaderIsA ? a.ballotName : b.ballotName} lidera com{' '}
                {pct1(Math.max(topRegion.aShare, topRegion.bShare))}% dos válidos até agora
              </>
            )}
            .
          </p>
        </article>
      )}

      {/* region cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginTop: 14,
        }}
      >
        {regions.map((r) => {
          const live = started && r.countedPct > 0.005;
          const favName = r.aShare > 52 ? a.ballotName : r.aShare < 48 ? b.ballotName : null;
          const favColor = r.aShare > 52 ? aColor : r.aShare < 48 ? bColor : null;
          return (
            <article
              key={r.name}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: '12px 14px',
                background: 'var(--bg-raised)',
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{r.name}</h3>
                <span className="num" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  {mi(r.electors)} eleitores
                </span>
              </div>

              {/* counted bar */}
              <div>
                <div
                  className="num"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10.5,
                    color: 'var(--text-dim)',
                    marginBottom: 5,
                  }}
                >
                  <span>apurado</span>
                  <span style={{ color: 'var(--text)', fontWeight: 700 }}>{pct1(r.countedPct * 100)}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-hover)', borderRadius: 1, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${r.countedPct * 100}%`,
                      height: '100%',
                      background: 'var(--green-urna)',
                      transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                </div>
              </div>

              {/* who the region favors */}
              {live ? (
                <>
                  <div
                    className="num"
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: -3 }}
                  >
                    <span style={{ color: aColor, fontWeight: 700 }}>{pct1(r.aShare)}%</span>
                    <span style={{ color: bColor, fontWeight: 700 }}>{pct1(r.bShare)}%</span>
                  </div>
                  <div
                    style={{
                      position: 'relative',
                      height: 6,
                      background: 'var(--bg-hover)',
                      borderRadius: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${r.aShare}%`,
                        background: aColor,
                        transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    />
                  </div>
                  <div className="num" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                    {favName ? (
                      <>
                        favorece <span style={{ color: favColor!, fontWeight: 700 }}>{favName}</span>
                        {' · '}faltam ~{mi(r.remaining)}
                      </>
                    ) : (
                      <>dividido · faltam ~{mi(r.remaining)}</>
                    )}
                  </div>
                </>
              ) : (
                <div className="num" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
                  {started
                    ? 'aguardando boletins'
                    : `${pct1(totalElectors > 0 ? (r.electors / totalElectors) * 100 : 0)}% do eleitorado nacional`}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!started && (
        <p className="num" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.6 }}>
          A contagem começa às 17h (BRT). Quando os primeiros boletins chegarem, este painel mostra ao vivo
          onde está o voto que falta — e para quem ele pende.
        </p>
      )}
    </section>
  );
});
