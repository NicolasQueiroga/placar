import { memo, useEffect, useMemo, useState } from 'react';
import type { RaceData, UFProgress } from '../types';
import { UF_NAMES } from './CanvasMap';
import { Duel, ReservedCopy } from './Duel';

const pct1 = (v: number) => v.toFixed(1).replace('.', ',');
const countStatus = (race: RaceData) => race.status === 'final'
  ? 'resultado final'
  : race.sectionsTotal > 0
    ? `${pct1((race.sectionsCounted / race.sectionsTotal) * 100)}% apurado`
    : 'aguardando apuração';

/**
 * Multi-dispute hero. Governor/senator/deputy races are 27 separate battles
 * (6 on a governor runoff), so a single "national" header duel is fiction —
 * SP's pair frozen on screen just because SP dominates the vote sum.
 * Instead the header cycles through the state duels, biggest electorate
 * first, with the state name and its own count status on top.
 */
export const StateDuelCycle = memo(function StateDuelCycle({
  ufResults,
  ufProgress,
  resetKey,
}: {
  ufResults: Map<string, RaceData>;
  ufProgress: Map<string, UFProgress>;
  resetKey: string; // race:turno — restart the cycle on tab/turno switch
}) {
  const ufs = useMemo(() => {
    const list = [...ufResults.keys()].filter(
      (uf) => (ufResults.get(uf)?.candidates.length ?? 0) >= 2,
    );
    list.sort(
      (a, b) =>
        (ufProgress.get(b)?.electorsTotal ?? 0) - (ufProgress.get(a)?.electorsTotal ?? 0),
    );
    return list;
  }, [ufResults, ufProgress]);

  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [resetKey, ufs.length]);
  useEffect(() => {
    if (ufs.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % ufs.length), 6000);
    return () => clearInterval(id);
  }, [ufs.length]);

  if (ufs.length === 0) return null;
  const uf = ufs[idx % ufs.length];
  const race = ufResults.get(uf)!;
  const a = race.candidates[0];
  const b = race.candidates[1];
  const reserveCandidates = ufs.flatMap((uf) => ufResults.get(uf)!.candidates.slice(0, 2));
  const stateNames = ufs.map((uf) => UF_NAMES[uf] ?? uf);
  const progressLabels = ufs.map((uf, i) => `${i + 1}/${ufs.length} · ${countStatus(ufResults.get(uf)!)}`);

  return (
    <div key={`${resetKey}:${uf}`} className="sent-in">
      <div
        className="eyebrow"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 8,
          marginTop: 16,
        }}
      >
        <ReservedCopy alternatives={stateNames}>{UF_NAMES[uf] ?? uf}</ReservedCopy>
        <span className="num" style={{ textAlign: 'right' }}>
          <ReservedCopy alternatives={progressLabels}>
            {progressLabels[idx % ufs.length]}
          </ReservedCopy>
        </span>
      </div>
      <Duel a={a} b={b} runoff={!!a.runoff} reserveCandidates={reserveCandidates} />
    </div>
  );
});
