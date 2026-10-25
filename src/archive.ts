import type { RaceData } from './types';

/**
 * Browser-driven national archive. TSE's WAF blocks the feed worker's own
 * fetches, so while the site is open each browser POSTs every new TSE
 * generation to the worker, which validates and stores it in the same
 * `history` table the cron used. Dedupe key is the TSE generation
 * timestamp — every browser derives the same one from the same file, so
 * concurrent visitors don't multiply rows (server INSERT OR IGNOREs).
 *
 * The key is a cosmetic deterrent (it ships in the public bundle); the
 * real server guards are strict validation + monotonic sections.
 */
const INGEST_URL = 'https://placar-feed.nicolasqueiroga.workers.dev/ingest';
const INGEST_KEY = '27bedc372abaadbd8b82206caec2396e';

const sent = new Set<string>(); // `${race}:${generatedAt}`

export function archiveNational(race: 'presidente' | 'presidente2', national: RaceData): void {
  // Local development and browser fixtures must never write live history.
  if (window.location.hostname !== 'placar.nqlabs.io') return;
  if (national.sectionsCounted <= 0 || national.candidates.length === 0) return;
  const ts = Date.parse(national.generatedAt);
  if (!Number.isFinite(ts)) return;
  const key = `${race}:${national.generatedAt}`;
  if (sent.has(key)) return;
  sent.add(key);
  fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-key': INGEST_KEY },
    body: JSON.stringify({
      race,
      points: [
        {
          ts,
          sections_pct:
            national.sectionsTotal > 0
              ? (national.sectionsCounted / national.sectionsTotal) * 100
              : 0,
          candidates: national.candidates.slice(0, 12).map((c) => ({
            name: c.ballotName,
            id: c.id,
            party: c.party,
            votes: c.votes,
            pct: c.percent,
          })),
        },
      ],
    }),
  }).catch(() => sent.delete(key)); // network failure — retry on the next tick
}
