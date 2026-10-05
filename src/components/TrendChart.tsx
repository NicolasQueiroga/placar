import { memo, useMemo } from 'react';
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
  const W = 640;
  const H = 180;
  const PAD = { l: 34, r: 8, t: 10, b: 18 };

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
  // y domain: min/max of series, padded, clamped around 0-100
  const vals = series.flatMap((s) => s.pts.map((p) => p.v));
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 2));
  const hi = Math.min(100, Math.ceil(Math.max(...vals) + 2));
  const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - PAD.t - PAD.b);

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
        {series.map((s) =>
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
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
        {series.map((s) => (
          <span key={s.id} style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
});
