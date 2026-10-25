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

/** Counting progress is context, not evidence that the sample is representative. */
function countingStage(counted: number): string {
  if (counted <= 0) return 'Aguardando o início da apuração.';
  if (counted < 1) return 'Ainda é cedo: menos de 1% das seções apuradas.';
  if (counted < 10) return `Apuração inicial: ${pct1(counted)}% das seções apuradas.`;
  if (counted < 50) return `Menos da metade das seções apuradas: ${pct1(counted)}%.`;
  if (counted < 90) return `Apuração em andamento: ${pct1(counted)}% das seções apuradas.`;
  if (counted < 100) return `Reta final da apuração: ${pct2(counted)}% das seções apuradas.`;
  return '100% das seções apuradas.';
}

function marginComment(counted: number): string {
  if (counted < 10) return 'a apuração ainda é inicial; os primeiros resultados não representam o país inteiro.';
  if (counted < 100) return 'resultado parcial; as seções restantes podem ter um perfil de voto diferente.';
  return 'com todas as seções apuradas.';
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
  const counted = national.sectionsTotal > 0
    ? Math.min(100, (national.sectionsCounted / national.sectionsTotal) * 100)
    : 0;
  const sentences = useMemo<Sentence[]>(() => {
    const a = national.candidates[0];
    const b = national.candidates[1];
    if (!a || !b) return [];
    const aColor = partyColor(a.party, a.coalition);
    const bColor = partyColor(b.party, b.coalition);
    const margin = a.percent - b.percent;
    const out: Sentence[] = [];
    if (national.sectionsCounted <= 0 || national.validVotes <= 0) {
      return [{ id: 'waiting', node: 'Os resultados dos candidatos aparecem quando as primeiras seções forem totalizadas.' }];
    }
    const complete = counted === 100;

    const name = (c: typeof a, color: string) => (
      <span style={{ color, fontWeight: 600 }}>{c.ballotName}</span>
    );

    // 1. the situation
    out.push({
      id: 'situation',
      node: (
        <>
          {name(a, aColor)} {a.elected ? 'foi eleito com' : complete ? 'terminou com' : 'tem'} {pct2(a.percent)}% contra {pct2(b.percent)}% de{' '}
          {name(b, bColor)}{complete ? '.' : ' nos votos apurados até agora.'}
        </>
      ),
    });

    // 2. the margin
    out.push({
      id: 'margin',
      node: (
        <>
          A diferença é de {pct2(margin)} pontos percentuais — {marginComment(counted)}
        </>
      ),
    });

    if (turno === 1 && a.runoff && b.runoff) {
      out.push({
        id: 'runoff',
        node: <>{name(a, aColor)} e {name(b, bColor)} passaram ao 2º turno.</>,
      });
    } else if (turno === 1 && forecast && !complete && counted >= 10) {
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
      const secsLeft = Math.max(0, national.sectionsTotal - national.sectionsCounted);
      // Don't extrapolate votes from the first sections (often overseas).
      // Their turnout is not representative of the uncounted electorate.
      if (secsLeft > 0) {
        out.push({
          id: 'left',
          node: (
            <>
              Restam {secsLeft.toLocaleString('pt-BR')} seções por apurar —{' '}
              {pct2(100 - counted)}% do total.
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
  }, [national, forecast, turno, ufProgress, counted]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (sentences.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % sentences.length), 7000);
    return () => clearInterval(id);
  }, [sentences.length]);

  if (sentences.length === 0) return null;
  const current = sentences[idx % sentences.length];

  return (
    <div>
      <div className="num" style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 8 }}>
        {countingStage(counted)}
      </div>
      <div
        style={{
          display: 'grid',
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
        {/* Overlapping grid cells reserve the tallest sentence at any width.
            Inactive copy contributes layout only, never visual/a11y content. */}
        {sentences.map((sentence) => (
          <div
            key={sentence.id}
            className={sentence.id === current.id ? 'sent-in' : undefined}
            aria-hidden={sentence.id !== current.id}
            style={{
              gridArea: '1 / 1',
              visibility: sentence.id === current.id ? 'visible' : 'hidden',
            }}
          >
            {sentence.node}
          </div>
        ))}
      </div>
    </div>
  );
});
