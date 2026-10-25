import { memo, useEffect, useMemo, useState } from 'react';
import type { RaceData, SecondRoundForecast, UFProgress } from '../types';
import { partyColor } from '../tse';

const pct2 = (v: number) => v.toFixed(2).replace('.', ',');
const pct1 = (v: number) => v.toFixed(1).replace('.', ',');
const mi = (v: number) => `${(v / 1e6).toFixed(1).replace('.', ',')} mi`;

interface Sentence {
  id: string;
  node: React.ReactNode;
}

/** The same 4-point margin reads differently at 20% and at 95% counted. */
function marginComment(margin: number, counted: number): string {
  const late = counted >= 90;
  if (margin < 3) return late ? 'apertadíssima até o fim.' : 'uma disputa apertadíssima.';
  if (margin < 6) return late ? 'vantagem que já parece definida.' : 'uma vantagem clara, mas não definitiva.';
  return late ? 'folga praticamente irreversível.' : 'uma folga considerável.';
}

/**
 * Rotating hero sentence — data-driven manchetes that state true things
 * about the live count. Each sentence is derived from the numbers, so as
 * the count moves, the story the page tells moves with it.
 * The sentence set is turno-aware: on the 2º turno the question is no
 * longer "will there be a runoff" but "how much vote is still out there".
 */
export const Manchete = memo(function Manchete({
  national,
  forecast,
  turno,
  ufProgress,
}: {
  national: RaceData;
  forecast: SecondRoundForecast | null;
  turno: 1 | 2;
  ufProgress: Map<string, UFProgress>;
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
          A diferença é de {pct2(margin)} pontos percentuais — {marginComment(margin, counted)}
        </>
      ),
    });

    if (turno === 1 && forecast) {
      // 1º turno looks forward: will it be decided today?
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
    } else if (turno === 2) {
      // 3. how much vote is still out there
      const secsLeft = national.sectionsTotal - national.sectionsCounted;
      const perSection =
        national.sectionsCounted > 0 ? national.validVotes / national.sectionsCounted : 0;
      const votesLeft = Math.round(secsLeft * perSection);
      if (secsLeft > 0 && votesLeft > 0) {
        out.push({
          id: 'left',
          node: (
            <>
              Restam {secsLeft.toLocaleString('pt-BR')} seções — cerca de {mi(votesLeft)} de
              votos válidos ainda por apurar.
            </>
          ),
        });
      }
      // 4. where that vote is — the state holding the most uncounted electors
      let biggest: UFProgress | null = null;
      let biggestLeft = 0;
      for (const u of ufProgress.values()) {
        const left = u.electorsTotal - u.electorsCounted;
        if (left > biggestLeft) {
          biggest = u;
          biggestLeft = left;
        }
      }
      if (biggest && biggestLeft > 100_000) {
        out.push({
          id: 'where',
          node: (
            <>
              {biggest.uf === 'ZZ' ? 'O exterior' : biggest.uf} é onde mais falta apurar:{' '}
              {mi(biggestLeft)} de eleitores em seções ainda não totalizadas.
            </>
          ),
        });
      }
    }

    // 5. abstention — factual, moves with the count
    const abstRate = national.electorsCounted
      ? (national.abstention / national.electorsCounted) * 100
      : 0;
    if (abstRate > 0 && national.abstention > 0) {
      out.push({
        id: 'abstention',
        node: (
          <>
            {pct1(abstRate)}% de abstenção nas seções apuradas — {mi(national.abstention)} de
            eleitores não compareceram.
          </>
        ),
      });
    }

    return out;
  }, [national, forecast, turno, ufProgress]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (sentences.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % sentences.length), 7000);
    return () => clearInterval(id);
  }, [sentences.length]);

  if (sentences.length === 0) return null;
  const current = sentences[idx % sentences.length];

  return (
    <div
      className="sent-in"
      key={current.id}
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
      {current.node}
    </div>
  );
});
