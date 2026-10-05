import { memo, useEffect, useMemo, useState } from 'react';
import type { RaceData, SecondRoundForecast } from '../types';
import { partyColor } from '../tse';

const pct2 = (v: number) => v.toFixed(2).replace('.', ',');
const pct1 = (v: number) => v.toFixed(1).replace('.', ',');

interface Sentence {
  id: string;
  node: React.ReactNode;
}

/**
 * Rotating hero sentence — data-driven manchetes that state true things
 * about the live count. Each sentence is derived from the numbers, so as
 * the count moves, the story the page tells moves with it.
 */
export const Manchete = memo(function Manchete({
  national,
  forecast,
}: {
  national: RaceData;
  forecast: SecondRoundForecast | null;
}) {
  const sentences = useMemo<Sentence[]>(() => {
    const a = national.candidates[0];
    const b = national.candidates[1];
    if (!a || !b) return [];
    const aColor = partyColor(a.party, a.coalition);
    const bColor = partyColor(b.party, b.coalition);
    const margin = a.percent - b.percent;
    const counted = (national.sectionsCounted / national.sectionsTotal) * 100;
    const out: Sentence[] = [];

    const name = (c: typeof a, color: string) => (
      <span style={{ color, fontWeight: 600 }}>{c.ballotName}</span>
    );

    // 1. the situation
    out.push({
      id: 'situation',
      node: (
        <>
          {name(a, aColor)} lidera com {pct2(a.percent)}% contra {pct2(b.percent)}% de{' '}
          {name(b, bColor)}, com {pct1(counted)}% das seções apuradas.
        </>
      ),
    });

    // 2. the margin
    out.push({
      id: 'margin',
      node: (
        <>
          A diferença é de {pct2(margin)} pontos percentuais —{' '}
          {margin < 3
            ? 'uma disputa apertadíssima.'
            : margin < 6
              ? 'uma vantagem clara, mas não definitiva.'
              : 'uma folga considerável.'}
        </>
      ),
    });

    // 3. the forecast
    if (forecast) {
      out.push({
        id: 'forecast',
        node: (
          <>
            O modelo dá{' '}
            <span style={{ color: 'var(--runoff)', fontWeight: 600 }}>
              {(forecast.probability * 100).toFixed(0)}% de chance
            </span>{' '}
            de 2º turno em 25 de outubro.
          </>
        ),
      });
    }

    // 4. turnout
    const turnout = national.electorsCounted
      ? (national.turnout / national.electorsCounted) * 100
      : 0;
    if (turnout > 0) {
      out.push({
        id: 'turnout',
        node: (
          <>
            {pct1(turnout)}% do eleitorado compareceu —{' '}
            {turnout < 75 ? 'abstenção alta como poucas vezes na história.' : 'participação intensa.'}
          </>
        ),
      });
    }

    return out;
  }, [national, forecast]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (sentences.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % sentences.length), 7000);
    return () => clearInterval(id);
  }, [sentences.length]);

  if (sentences.length === 0) return null;

  return (
    <div
      className="sent-in"
      key={sentences[idx]?.id}
      style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'clamp(19px, 2.4vw, 26px)',
        fontWeight: 400,
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
        maxWidth: 640,
        minHeight: '2.5em',
        textWrap: 'balance',
      }}
      aria-live="polite"
    >
      {sentences[idx]?.node}
    </div>
  );
});
