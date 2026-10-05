import { memo } from 'react';
import type { SecondRoundForecast, RaceData } from '../types';
import { CountUp } from './CountUp';

/**
 * The signature element: probability of a second round, with the
 * "what's left" meter — segmented squares like ballot boxes, filling
 * green as Brazil finishes counting.
 */
export const RunoffGauge = memo(function RunoffGauge({
  forecast,
  national,
}: {
  forecast: SecondRoundForecast;
  national: RaceData;
}) {
  const pct = forecast.probability * 100;
  const decided = forecast.decided || national.status === 'final';
  // Gauge: probability of RUNOFF. High = red (more rounds), low = green.
  const color = pct > 60 ? 'var(--runoff)' : pct > 25 ? 'var(--amber)' : 'var(--green-urna)';

  return (
    <div>
      <div className="eyebrow">2º turno</div>
      {decided ? (
        <>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              lineHeight: 1.1,
              color: 'var(--runoff)',
              marginTop: 4,
            }}
          >
            25 de outubro
          </div>
          <div className="num" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
            confirmado — nenhum candidato alcançou a maioria absoluta
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span
              className="fig"
              style={{
                fontSize: 56,
                lineHeight: 1,
                color,
                transition: 'color 700ms',
              }}
            >
              <CountUp value={pct} format={(v) => `${v.toFixed(0)}%`} />
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>estimado</span>
          </div>
          {/* Probability bar */}
          <div
            style={{
              height: 6,
              background: 'var(--bg-raised)',
              borderRadius: 1,
              overflow: 'hidden',
              marginTop: 10,
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: color,
                transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1), background 700ms',
              }}
            />
          </div>
          <div
            className="num"
            style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}
          >
            {forecast.method}
          </div>
          <div className="num" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            líder precisa de {(forecast.leaderNeeds * 100).toFixed(1).replace('.', ',')}% dos votos
            restantes p/ 50%
          </div>
        </>
      )}
    </div>
  );
});

/** Segmented "what's left to count" meter — the ballot-box squares. */
export const RemainingMeter = memo(function RemainingMeter({
  national,
}: {
  national: RaceData;
}) {
  const SEGMENTS = 40;
  const done = national.sectionsTotal > 0 ? national.sectionsCounted / national.sectionsTotal : 0;
  const filled = Math.round(done * SEGMENTS);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span className="eyebrow">Apuração</span>
        <span style={{ fontWeight: 700, fontSize: 18 }}>
          <CountUp value={done * 100} format={(v) => `${v.toFixed(1).replace('.', ',')}%`} />
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${SEGMENTS}, 1fr)`,
          gap: 3,
          marginTop: 8,
        }}
        role="progressbar"
        aria-valuenow={Math.round(done * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Seções apuradas"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <div
            key={i}
            style={{
              height: 14,
              borderRadius: 2,
              background: i < filled ? 'var(--green-urna)' : 'var(--bg-hover)',
              opacity: i < filled ? (national.status === 'final' ? 1 : 0.55 + (0.45 * i) / SEGMENTS) : 1,
              transition: 'background 600ms',
            }}
          />
        ))}
      </div>
      <div
        className="num"
        style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>
          <CountUp value={national.sectionsCounted} /> / <CountUp value={national.sectionsTotal} /> seções
        </span>
        <span>
          faltam{' '}
          <CountUp value={Math.max(0, national.sectionsTotal - national.sectionsCounted)} />
        </span>
      </div>
    </div>
  );
});
