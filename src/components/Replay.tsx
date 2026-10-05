import { memo, useEffect, useRef, useState } from 'react';
import { partyColor } from '../tse';

/**
 * Replay — "watch the count again". Scrubs through the D1 minute archive
 * of the national presidential race. Play at 1–60× speed, or drag.
 * Sparse until the runoff night; on Oct 25 it replays the whole count.
 */

const HISTORY_URL = 'https://placar-feed.nicolasqueiroga.workers.dev/history?minutes=1440';

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

export const Replay = memo(function Replay() {
  const [points, setPoints] = useState<ReplayPoint[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(12); // archive points per second
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(HISTORY_URL, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((d: { points: unknown[] }) => {
        if (!alive) return;
        const pts: ReplayPoint[] = (d.points as Record<string, string>[]).map((p) => ({
          ts: Number(p.ts),
          sections_pct: Number(p.sections_pct),
          candidates: JSON.parse(p.candidates) as ReplayCandidate[],
        }));
        pts.sort((a, b) => a.ts - b.ts);
        setPoints(pts);
        if (pts.length > 0) setIdx(pts.length - 1);
      })
      .catch(() => alive && setPoints([]));
    return () => {
      alive = false;
    };
  }, []);

  // playback
  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (!playing || !points) return;
    timer.current = window.setInterval(() => {
      setIdx((i) => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1000 / speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, points]);

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

      {/* the moment */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(16px, 3vw, 40px)', marginTop: 14, flexWrap: 'wrap' }}>
        {a && (
          <span className="fig" style={{ fontSize: 'clamp(30px, 4vw, 52px)', color: partyColor(a.party, a.party) }}>
            {pct(a.pct)}
          </span>
        )}
        {a && b && (
          <span className="num" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {a.name} × {b.name}
          </span>
        )}
        {b && (
          <span className="fig" style={{ fontSize: 'clamp(30px, 4vw, 52px)', color: partyColor(b.party, b.party) }}>
            {pct(b.pct)}
          </span>
        )}
        <span className="num" style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 'auto' }}>
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
          min={0}
          max={points.length - 1}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setIdx(Number(e.target.value));
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
