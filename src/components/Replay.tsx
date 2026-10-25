import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { partyColor } from '../tse';

/**
 * Replay — "watch the count again". Scrubs through the D1 minute archive
 * of the national presidential race. Play at 1–60× speed, or drag.
 * Sparse until the runoff night; on Oct 25 it replays the whole count.
 */

const HISTORY_URL = 'https://placar-feed.nicolasqueiroga.workers.dev/history';

// 1º turno: pin to the Oct 4 counting night (same window as the chart);
// 2º turno: the last 24 h, which covers the whole runoff night.
const T1_NIGHT_START = 1791133200000; // 2026-10-04 14:00 BRT
const T1_NIGHT_END = 1791181800000; //   2026-10-05 12:00 BRT
const replayQuery = (race: 'presidente' | 'presidente2') =>
  race === 'presidente'
    ? `from=${T1_NIGHT_START}&to=${T1_NIGHT_END}`
    : 'minutes=1440';

interface ReplayCandidate {
  name: string;
  id: string;
  party: string;
  votes: number;
  pct: number;
}

interface ReplayPoint {
  ts: number;
  sections_pct: number;
  candidates: ReplayCandidate[];
}

const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;

export const Replay = memo(function Replay({ race }: { race: 'presidente' | 'presidente2' }) {
  const [points, setPoints] = useState<ReplayPoint[] | null>(null);
  const [tsPos, setTsPos] = useState(0); // slider position, epoch minutes
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(12); // archive minutes per second
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${HISTORY_URL}?${replayQuery(race)}&race=${race}`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((d: { points: unknown[] }) => {
        if (!alive) return;
        const pts: ReplayPoint[] = (d.points as Record<string, string>[]).map((p) => ({
          ts: Number(p.ts),
          sections_pct: Number(p.sections_pct),
          candidates: JSON.parse(p.candidates) as ReplayCandidate[],
        }));
        pts.sort((a, b) => a.ts - b.ts);
        // The archive's first point is the first generation WITH data
        // (~17:20 — collectors skip zero-section rows), so the slider
        // would start at 1-2% already counted. Synthesize the true 17:00
        // BRT zero-state from the first point's candidate list.
        if (pts.length > 0) {
          const first = pts[0];
          const f = new Date(first.ts);
          let countStart = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), 20, 0, 0); // 17:00 BRT
          if (first.ts < countStart) countStart -= 86_400_000; // after-midnight point → previous evening
          if (first.ts > countStart) {
            pts.unshift({
              ts: countStart,
              sections_pct: 0,
              candidates: first.candidates.map((c) => ({ ...c, votes: 0, pct: 0 })),
            });
          }
        }
        // Collapse consecutive identical states: after the count ends the
        // cron keeps re-collecting the unchanged final file every 2 min,
        // which would otherwise drag a dead tail of duplicate frames past
        // the real end of the night (same pollution the 1º turno had).
        const state = (p: ReplayPoint) =>
          `${p.sections_pct.toFixed(6)}|${p.candidates.map((c) => c.votes).join('/')}`;
        const collapsed = pts.filter((p, i) => i === 0 || state(p) !== state(pts[i - 1]));
        setPoints(collapsed);
        if (collapsed.length > 0) setTsPos(Math.floor(collapsed[collapsed.length - 1].ts / 60_000));
      })
      .catch(() => alive && setPoints([]));
    return () => {
      alive = false;
    };
  }, [race]);

  // playback — advances WALL-CLOCK minutes (speed = archive min/s), so
  // data gaps hold the last frame for their true duration instead of
  // one tick each; the slider below is time-proportional too.
  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (!playing || !points || points.length === 0) return;
    const end = Math.floor(points[points.length - 1].ts / 60_000);
    timer.current = window.setInterval(() => {
      setTsPos((m) => {
        if (m >= end) {
          setPlaying(false);
          return m;
        }
        return m + 1;
      });
    }, 1000 / speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, points]);

  // slider is TIME-proportional (epoch minutes); the displayed frame is
  // the latest archived point at or before that moment, so gaps hold
  // their frame for their true duration instead of one tick each
  const { idx, startMin, endMin } = useMemo(() => {
    if (!points || points.length === 0) return { idx: 0, startMin: 0, endMin: 0 };
    const start = Math.floor(points[0].ts / 60_000);
    const end = Math.floor(points[points.length - 1].ts / 60_000);
    const target = tsPos * 60_000;
    let lo = 0;
    let hi = points.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].ts <= target) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return { idx: ans, startMin: start, endMin: end };
  }, [points, tsPos]);

  if (points === null) {
    return (
      <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)', padding: '16px 0' }}>
        carregando arquivo…
      </div>
    );
  }
  if (points.length < 2) {
    return (
      <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)', padding: '16px 0' }}>
        arquivo ainda curto — o replay fica melhor conforme a noite de 25 de outubro acumula minutos.
      </div>
    );
  }

  const cur = points[idx];
  const a = cur.candidates[0];
  const b = cur.candidates[1];
  const t = new Date(cur.ts);

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg-raised)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div className="eyebrow">Replay da apuração — presidência, minuto a minuto</div>
        <div className="num" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {points.length} minutos arquivados
        </div>
      </div>

      {/* the moment — flex line on desktop, pinned grid on phones (css) */}
      <div
        className="replay-moment"
        style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(16px, 3vw, 40px)', marginTop: 14, flexWrap: 'wrap' }}
      >
        {a && (
          <span className="fig" style={{ fontSize: 'clamp(26px, 4vw, 52px)', color: partyColor(a.party, a.party) }}>
            {pct(a.pct)}
          </span>
        )}
        {a && b && (
          <span className="num rp-names" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {a.name} × {b.name}
          </span>
        )}
        {b && (
          <span className="fig rp-b" style={{ fontSize: 'clamp(26px, 4vw, 52px)', color: partyColor(b.party, b.party) }}>
            {pct(b.pct)}
          </span>
        )}
        <span className="num rp-when" style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 'auto' }}>
          {t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {cur.sections_pct.toFixed(1).replace('.', ',')}% apurado
        </span>
      </div>

      {/* scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pausar replay' : 'Reproduzir replay'}
          className="ctl"
          style={{ ['--c' as string]: playing ? 'var(--green-urna)' : 'var(--text)' }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={startMin}
          max={endMin}
          value={tsPos}
          onChange={(e) => {
            setPlaying(false);
            setTsPos(Number(e.target.value));
          }}
          aria-label="Posição do replay"
          style={{ flex: 1, accentColor: 'var(--green-urna)', cursor: 'pointer' }}
        />
        <span className="num" style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
          {idx + 1}/{points.length}
        </span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Velocidade do replay"
          className="num"
          style={{
            background: 'transparent',
            border: '1px solid var(--line)',
            color: 'var(--text-dim)',
            fontSize: 11,
            padding: '4px 6px',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          {[2, 6, 12, 30, 60].map((s) => (
            <option key={s} value={s} style={{ background: 'var(--bg)' }}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </div>
  );
});
