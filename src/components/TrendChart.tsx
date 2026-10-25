import { memo, useEffect, useMemo, useState } from 'react';
import type { TrendPoint } from '../trend';
import type { Candidate } from '../types';
import { partyColor } from '../tse';

/**
 * Minimal multi-series line chart: leader share (%) over time.
 * Plain SVG — no chart library needed for 2-4 lines.
 */
export const TrendChart = memo(function TrendChart({
  points,
  candidates,
}: {
  points: TrendPoint[];
  candidates: Candidate[];
}) {
  // viewBox follows the viewport: a fixed 640-wide viewBox squeezed into a
  // 390px phone renders 9px labels at ~5px — unreadable. 400px on phones
  // keeps text near its intended size (recomputed on orientation change).
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const W = vw < 560 ? 400 : 640;
  const H = 180;
  const PAD = { l: 30, r: 40, t: 10, b: 18 }; // r: room for end-of-line values

  const series = useMemo(() => {
    const top = candidates.slice(0, 4);
    return top.map((c) => ({
      id: c.id,
      name: c.ballotName,
      color: partyColor(c.party, c.coalition),
      pts: points
        .map((p) => ({ t: p.t, v: p.percents[c.id] }))
        .filter((p) => p.v !== undefined),
    }));
  }, [points, candidates]);

  // every candidate is drawn by default; the legend toggles series and the
  // y-domain re-fits to what remains visible — showing Cury+Renan pins the
  // domain to 0-54, hiding them zooms into the duel (standard chart UX)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.id));
  const drawn = visible.length > 0 ? visible : series; // can't hide everything

  if (points.length < 2) {
    return (
      <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)', padding: '24px 0' }}>
        gráfico aparece após 2 atualizações de dados
      </div>
    );
  }

  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  // y domain: min/max of the DRAWN series, padded, clamped around 0-100
  const vals = drawn.flatMap((s) => s.pts.map((p) => p.v));
  if (vals.length === 0) return null;
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 2));
  const hi = Math.min(100, Math.ceil(Math.max(...vals) + 2));
  const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - PAD.t - PAD.b);

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // end-of-line value labels — touch has no hover, so the current number
  // lives at the end of each line; nudged apart when the lines converge
  const endLabels = drawn
    .map((s) => ({ s, last: s.pts[s.pts.length - 1] }))
    .filter((l) => l.last)
    .map((l) => ({ ...l, ly: y(l.last.v) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].ly - endLabels[i - 1].ly < 11) endLabels[i].ly = endLabels[i - 1].ly + 11;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
        aria-label="Evolução da votação ao longo do tempo">
        {/* 50% reference line (only if in domain) */}
        {lo < 50 && hi > 50 && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(50)} y2={y(50)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={PAD.l - 4} y={y(50) + 3} textAnchor="end" fontSize={9} fill="var(--text-faint)" className="num">
              50%
            </text>
          </>
        )}
        {/* y gridlines at nice steps */}
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" />
            <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-faint)" className="num">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {drawn.map((s) =>
          s.pts.length < 2 ? null : (
            <polyline
              key={s.id}
              points={s.pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          ),
        )}
        {endLabels.map((l) => (
          <g key={l.s.id}>
            <circle cx={x(l.last.t)} cy={y(l.last.v)} r={2} fill={l.s.color} />
            <text x={W - PAD.r + 5} y={l.ly + 3.5} fontSize={10} fontWeight={700} fill={l.s.color} className="num">
              {l.last.v.toFixed(1).replace('.', ',')}
            </text>
          </g>
        ))}
        {/* x labels: first, middle, last */}
        {[t0, (t0 + t1) / 2, t1].map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - 4}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fontSize={9}
            fill="var(--text-faint)"
            className="num"
          >
            {fmtTime(t)}
          </text>
        ))}
      </svg>
      {/* legend toggles series — tap Cury/Renan off to zoom into the duel */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }} role="group" aria-label="Séries do gráfico">
        {series.map((s) => {
          const off = hidden.has(s.id);
          return (
            <button
              key={s.id}
              aria-pressed={!off}
              title={off ? 'mostrar no gráfico' : 'ocultar do gráfico'}
              onClick={() =>
                setHidden((h) => {
                  const next = new Set(h);
                  if (next.has(s.id)) next.delete(s.id);
                  else next.add(s.id);
                  return next;
                })
              }
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'inherit',
                color: 'var(--text-dim)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                opacity: off ? 0.35 : 1,
              }}
            >
              <span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />
              <span style={{ textDecoration: off ? 'line-through' : 'none' }}>{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
