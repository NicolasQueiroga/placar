import type { RaceData } from './types';

/**
 * 2nd-round scenario engine.
 *
 * Grounded in three inputs:
 *  1. The live 1st-round result (shares of the two finalists + the pool of
 *     eliminated candidates' votes).
 *  2. The historical record of Brazilian presidential runoffs since 1989.
 *  3. Explicit, named assumptions about how the pool redistributes.
 *
 * Each scenario keeps the 1st-round base fixed and varies only the
 * redistribution of the eliminated candidates' pool — the same lever that
 * decided every real runoff in the historical series.
 */

export interface RunoffScenario {
  key: string;
  title: string;
  precedent: string;
  rationale: string;
  /** finalist A = 1st-round leader */
  aShare: number; // % of valid runoff votes
  bShare: number;
}

export interface RunoffReference {
  year: number;
  winner: string;
  /** winner's 1st-round share, % */
  first: number;
  /** winner's runoff share, % */
  runoff: number;
}

/** Official results of every Brazilian presidential runoff since 1989. */
export const RUNOFF_REFERENCES: RunoffReference[] = [
  { year: 1989, winner: 'Collor', first: 28.5, runoff: 53.0 },
  { year: 2002, winner: 'Lula', first: 46.4, runoff: 61.3 },
  { year: 2006, winner: 'Lula', first: 48.6, runoff: 60.8 },
  { year: 2010, winner: 'Dilma', first: 46.9, runoff: 56.1 },
  { year: 2014, winner: 'Dilma', first: 41.6, runoff: 51.6 },
  { year: 2018, winner: 'Bolsonaro', first: 46.0, runoff: 55.1 },
  { year: 2022, winner: 'Lula', first: 48.4, runoff: 50.9 },
];

/** In all 7 runoffs since 1989 the 1st-round leader won — but the final
 *  margin shrank as elections polarized. This is the honest base rate. */
export const LEADER_RUNOFF_RECORD = '7 de 7';

export function buildScenarios(national: RaceData): RunoffScenario[] {
  const a = national.candidates[0];
  const b = national.candidates[1];
  if (!a || !b) return [];

  const aPct = a.percent;
  const bPct = b.percent;
  const pool = Math.max(0, 100 - aPct - bPct);

  /** Redistribute the pool with weights wA/wB (the remainder goes blank/null
   *  or stays home — runoff turnout historically drops). */
  const duel = (wA: number, wB: number) => {
    const a2 = aPct + pool * wA;
    const b2 = bPct + pool * wB;
    const norm = a2 + b2;
    return { aShare: (a2 / norm) * 100, bShare: (b2 / norm) * 100 };
  };

  const propA = aPct / (aPct + bPct);
  const propB = bPct / (aPct + bPct);

  return [
    {
      key: 'repeticao',
      title: 'Repetição do 1º turno',
      precedent: 'cenário-base',
      rationale:
        'O eleitorado do 2º turno espelha o 1º: os votos dos candidatos eliminados dividem-se na mesma proporção das duas bases. É o piso de referência — qualquer resultado diferente exige que a redistribuição fuja desse padrão.',
      ...duel(propA, propB),
    },
    {
      key: 'mobilizacao',
      title: 'Mobilização da base petista',
      precedent: 'ref. 2022 — Lula 48,4 → 50,9',
      rationale:
        'A campanha do PT absorve a maior parte dos votos eliminados, com pautas de renda, inflação e programas sociais dominando as ruas, e eleva o comparecimento no Norte e Nordeste — o movimento que converteu 48,4% em 50,9% em 2022.',
      ...duel(0.34, 0.62),
    },
    {
      key: 'consolidacao',
      title: 'Consolidação do bloco de direita',
      precedent: 'ref. 2018 — Bolsonaro 46,0 → 55,1',
      rationale:
        'O líder absorve o voto dos candidatos eliminados com pautas de ordem pública, agronegócio e liberdade econômica, e capitaliza a estrutura partidária nos municípios — o salto que levou o bloco de 46,0% a 55,1% em 2018.',
      ...duel(0.62, 0.34),
    },
  ];
}
