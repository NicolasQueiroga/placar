import { memo, useEffect, useMemo, useState } from 'react';
import type { RaceData, UFProgress } from '../types';
import { partyColor } from '../tse';
import { CountUp } from './CountUp';
import { BrazilMap } from './BrazilMap';

const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;

/**
 * TV mode — placar.nqlabs.io/#tv
 * Fullscreen, auto-cycling panels for a projector on election night.
 * No interaction: it shows, it rotates, it stays legible from a couch.
 */

type Panel = 'duel' | 'map' | 'states' | 'trend';

const PANELS: Panel[] = ['duel', 'map', 'states', 'trend'];
const PANEL_MS = 12_000;
const FADE_MS = 600;

interface TVProps {
  national: RaceData;
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
  trendPoints: { t: number; counted: number; percents: Record<string, number> }[];
}

export const TVMode = memo(function TVMode({
  national,
  ufProgress,
  ufResults,
  trendPoints,
}: TVProps) {
  const [panel, setPanel] = useState<Panel>('duel');
  const [visible, setVisible] = useState(true);

  // cycle panels with a crossfade
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPanel((p) => PANELS[(PANELS.indexOf(p) + 1) % PANELS.length]);
        setVisible(true);
      }, FADE_MS);
    }, PANEL_MS);
    return () => clearInterval(id);
  }, []);

  const leader = national.candidates[0];
  const runnerUp = national.candidates[1];
  const counted = (national.sectionsCounted / national.sectionsTotal) * 100;

  const header = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px clamp(24px, 5vw, 72px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="live-dot" style={{ width: 10, height: 10 }} aria-hidden />
        <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 22, letterSpacing: '0.03em' }}>
          Placar
        </span>
        <span className="eyebrow" style={{ fontSize: 13 }}>
          Eleições 2026 · dados oficiais TSE
        </span>
      </div>
      <div className="num" style={{ fontSize: 15, color: 'var(--text-dim)' }}>
        {counted.toFixed(1).replace('.', ',')}% apurado · {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      {header}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 clamp(24px, 5vw, 72px) 32px',
          opacity: visible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms var(--ease)`,
        }}
      >
        {panel === 'duel' && leader && runnerUp && <TVDuel national={national} />}
        {panel === 'map' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 900 }}>
              <BrazilMap ufProgress={ufProgress} ufResults={ufResults} />
            </div>
          </div>
        )}
        {panel === 'states' && <TVStates ufResults={ufResults} />}
        {panel === 'trend' && <TVTrend points={trendPoints} national={national} />}
      </div>
      {/* exit hint — tiny, out of the way */}
      <div
        className="num"
        style={{ position: 'absolute', bottom: 12, right: 16, fontSize: 10, color: 'var(--text-faint)' }}
      >
        #/tv · esc para sair
      </div>
    </div>
  );
});

function TVDuel({ national }: { national: RaceData }) {
  const [a, b] = national.candidates;
  if (!a || !b) return null;
  const aColor = partyColor(a.party, a.coalition);
  const bColor = partyColor(b.party, b.coalition);
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'end',
          gap: 'clamp(24px, 6vw, 96px)',
        }}
      >
        <div>
          <div style={{ fontSize: 'clamp(24px, 3.4vw, 44px)', fontWeight: 700, textTransform: 'uppercase', color: aColor, lineHeight: 1.05 }}>
            {a.ballotName}
          </div>
          <div className="num" style={{ fontSize: 16, color: 'var(--text-dim)', marginTop: 8 }}>
            {a.party} · <CountUp value={a.votes} /> votos
          </div>
          <div className="fig" style={{ fontSize: 'clamp(88px, 13vw, 200px)', lineHeight: 1, marginTop: 12 }}>
            <CountUp value={a.percent} format={pct} />
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 4vw, 56px)', color: 'var(--text-faint)', paddingBottom: 'clamp(40px, 7vw, 120px)' }}>
          ×
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'clamp(24px, 3.4vw, 44px)', fontWeight: 700, textTransform: 'uppercase', color: bColor, lineHeight: 1.05 }}>
            {b.ballotName}
          </div>
          <div className="num" style={{ fontSize: 16, color: 'var(--text-dim)', marginTop: 8 }}>
            <CountUp value={b.votes} /> votos · {b.party}
          </div>
          <div className="fig" style={{ fontSize: 'clamp(88px, 13vw, 200px)', lineHeight: 1, marginTop: 12 }}>
            <CountUp value={b.percent} format={pct} />
          </div>
        </div>
      </div>
      {/* margin bar */}
      <div style={{ marginTop: 36, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="eyebrow" style={{ fontSize: 13 }}>
          vantagem de {a.ballotName}
        </span>
        <span className="fig" style={{ fontSize: 'clamp(28px, 4vw, 48px)', color: aColor }}>
          {(a.percent - b.percent).toFixed(2).replace('.', ',')} p.p.
        </span>
      </div>
    </div>
  );
}

function TVStates({ ufResults }: { ufResults: Map<string, RaceData> }) {
  const ufs = useMemo(() => {
    const order = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
    return order
      .map((uf) => ({ uf, data: ufResults.get(uf) }))
      .filter((x): x is { uf: string; data: RaceData } => !!x.data);
  }, [ufResults]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '12px 20px',
        alignContent: 'center',
      }}
    >
      {ufs.map(({ uf, data }) => {
        const c = data.candidates[0];
        if (!c) return null;
        const color = partyColor(c.party, c.coalition);
        return (
          <div key={uf} style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid var(--line-soft)', paddingBottom: 8 }}>
            <span className="num" style={{ fontSize: 18, color: 'var(--text-dim)' }}>{uf}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.ballotName}
            </span>
            <span className="fig" style={{ fontSize: 22, marginLeft: 'auto' }}>
              {c.percent.toFixed(1).replace('.', ',')}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TVTrend({
  points,
  national,
}: {
  points: { t: number; counted: number; percents: Record<string, number> }[];
  national: RaceData;
}) {
  const top = national.candidates.slice(0, 2);
  const W = 1200;
  const H = 480;
  const PAD = { l: 60, r: 30, t: 20, b: 50 };

  if (points.length < 2) {
    return (
      <div className="num" style={{ fontSize: 16, color: 'var(--text-dim)', textAlign: 'center' }}>
        aguardando pontos suficientes para o gráfico…
      </div>
    );
  }

  const allV = points.flatMap((p) => Object.values(p.percents));
  const min = Math.min(...allV);
  const max = Math.max(...allV);
  const lo = Math.max(0, min - 2);
  const hi = Math.min(100, max + 2);
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="eyebrow" style={{ fontSize: 13 }}>
        Evolução da apuração — % de votos válidos
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '58vh' }} role="img" aria-label="Gráfico de evolução">
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = lo + f * (hi - lo);
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" strokeWidth={1} />
              <text x={PAD.l - 10} y={y(v) + 5} textAnchor="end" fontSize={18} fill="var(--text-faint)" fontFamily="var(--font-mono)">
                {v.toFixed(0)}%
              </text>
            </g>
          );
        })}
        {top.map((c) => {
          const color = partyColor(c.party, c.coalition);
          const pts = points
            .map((p, i) => ({ v: p.percents[c.id], i }))
            .filter((p) => p.v !== undefined);
          if (pts.length < 2) return null;
          const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
          return (
            <g key={c.id}>
              <path d={d} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(pts[pts.length - 1].i)} cy={y(pts[pts.length - 1].v)} r={7} fill={color} />
              <text
                x={W - PAD.r}
                y={y(pts[pts.length - 1].v) - 16}
                textAnchor="end"
                fontSize={24}
                fontWeight={700}
                fill={color}
              >
                {c.ballotName} {c.percent.toFixed(2).replace('.', ',')}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
