import type {
  Candidate,
  RaceData,
  RaceStatus,
  SecondRoundForecast,
  TseAcompanhamento,
  TseUnified,
  UFProgress,
} from './types';

const BASE = 'https://resultados.tse.jus.br/oficial/ele2026';

export const ELECTIONS = {
  presidente1: '6257',
  presidente2: '6258',
  estadual1: '6259',
} as const;

export const CARGOS = {
  presidente: '0001',
  governador: '0003',
  senador: '0005',
  depFederal: '0006',
  depEstadual: '0007',
  depDistrital: '0008',
} as const;

/** Races the app exposes. scope 'br' = national file exists; 'uf' = per-UF only. */
export const RACES = [
  { key: 'presidente', label: 'Presidente', election: ELECTIONS.presidente1, cargo: CARGOS.presidente, scope: 'br', runoff: true },
  { key: 'governador', label: 'Governador', election: ELECTIONS.estadual1, cargo: CARGOS.governador, scope: 'uf', runoff: true },
  { key: 'senador', label: 'Senador', election: ELECTIONS.estadual1, cargo: CARGOS.senador, scope: 'uf', runoff: false },
  { key: 'depFederal', label: 'Dep. Federal', election: ELECTIONS.estadual1, cargo: CARGOS.depFederal, scope: 'uf', runoff: false },
] as const;

export type RaceKey = (typeof RACES)[number]['key'];

/** Election code padded to 6: 6257 -> e006257 */
const ecode = (e: string) => `e${e.padStart(6, '0')}`;

export function unifiedUrl(uf: 'br' | string, cargo: string, election: string): string {
  return `${BASE}/${election}/dados/${uf.toLowerCase()}/${uf.toLowerCase()}-c${cargo}-${ecode(election)}-u.json`;
}

export function acompanhamentoUrl(election: string): string {
  return `${BASE}/${election}/dados/br/br-${ecode(election)}-ab.json`;
}

/** "50,202838530" -> 50.20283853 */
export function brNum(s: string | undefined): number {
  if (!s) return 0;
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

/** "27484298" -> 27484298 */
const int = (s: string | undefined): number => (s ? Number(s) : 0);

const etags = new Map<string, string>();

async function fetchJson<T>(url: string): Promise<T | null> {
  const etag = etags.get(url);
  const res = await fetch(`${url}?nocache=${Date.now()}`, {
    headers: etag ? { 'If-None-Match': etag } : undefined,
  });
  if (res.status === 304) return null; // unchanged — caller keeps previous data
  if (!res.ok) throw new Error(`TSE ${res.status} ${url}`);
  const newEtag = res.headers.get('etag');
  if (newEtag) etags.set(url, newEtag);
  return (await res.json()) as T;
}

export function normalizeUnified(raw: TseUnified): RaceData {
  const cargo = raw.carg?.[0];
  const candidates: Candidate[] = [];
  for (const agr of cargo?.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const c of par.cand ?? []) {
        candidates.push({
          id: c.sqcand,
          ballotName: c.nmu,
          fullName: c.nm,
          number: c.n,
          party: par.sg,
          coalition: agr.com,
          votes: int(c.vap),
          percent: brNum(c.pvapn),
          elected: c.e === 's',
          runningMate: c.vs?.[0]?.nmu,
        });
      }
    }
  }
  candidates.sort((a, b) => b.votes - a.votes);
  const status: RaceStatus = raw.and === 'f' ? 'final' : candidates.length > 0 ? 'partial' : 'waiting';
  return {
    status,
    generatedAt: `${raw.dg.split('/').reverse().join('-')}T${raw.hg}-03:00`,
    sectionsTotal: int(raw.s?.ts),
    sectionsCounted: int(raw.s?.st),
    electorsTotal: int(raw.e?.te),
    electorsCounted: int(raw.e?.est),
    turnout: int(raw.e?.c),
    abstention: int(raw.e?.a),
    blank: int(raw.v?.vb),
    nullVotes: int(raw.v?.vn ?? raw.v?.tvn),
    validVotes: int(raw.v?.vvc),
    candidates,
  };
}

export function normalizeAcompanhamento(raw: TseAcompanhamento): UFProgress[] {
  return raw.abr
    .filter((a) => 'cdabr' in a && a.tpabr === 'uf' && !['br', 'zz'].includes(a.cdabr))
    .map((a) => ({
      uf: a.cdabr.toUpperCase(),
      status: a.and === 'f' ? ('final' as const) : ('partial' as const),
      percentSections: brNum(a.s.pstn),
      electorsTotal: int(a.e.te),
      electorsCounted: int(a.e.est),
      updatedAt: `${a.dt.split('/').reverse().join('-')}T${a.ht}-03:00`,
    }));
}

export async function fetchNational(election: string = ELECTIONS.presidente1, cargo: string = CARGOS.presidente): Promise<RaceData> {
  const raw = await fetchJson<TseUnified>(unifiedUrl('br', cargo, election));
  if (!raw) throw new Error('unchanged');
  return normalizeUnified(raw);
}

export async function fetchAcompanhamento(election: string = ELECTIONS.presidente1): Promise<UFProgress[]> {
  const raw = await fetchJson<TseAcompanhamento>(acompanhamentoUrl(election));
  if (!raw) return []; // 304 — caller keeps previous
  return normalizeAcompanhamento(raw);
}

export async function fetchUF(
  uf: string,
  election: string = ELECTIONS.presidente1,
  cargo: string = CARGOS.presidente,
): Promise<RaceData> {
  const raw = await fetchJson<TseUnified>(unifiedUrl(uf, cargo, election));
  if (!raw) throw new Error('unchanged');
  return normalizeUnified(raw);
}

/**
 * Second-round probability model.
 *
 * Logic: the leader wins outright iff their final share of VALID votes > 50%.
 * We know counted valid votes per candidate. The remaining votes are unknown;
 * model them as distributed across candidates in proportion to their current
 * shares, weighted by the electorate that hasn't been totalized.
 *
 * P(runoff) = P(leader's final share <= 50%).
 * Under the proportional-remaining model, leader's final share is exactly
 * their current share (self-consistent), so the uncertainty comes from the
 * heterogeneity of what's left. We approximate the remaining votes' vote
 * distribution as a Dirichlet-multinomial around current shares with a
 * concentration that shrinks as more votes are counted (less uncertainty).
 *
 * Simpler, defensible approximation (what we ship tonight):
 *   sigma ≈ sqrt(p_leader * (1 - p_leader) / n_remaining_effective)
 * where n_remaining_effective scales the variance to reflect that remaining
 * UFs can differ from the national average. We use a conservative inflation
 * factor based on the dispersion of UF-level results.
 */
export function forecastSecondRound(
  national: RaceData,
  ufProgress: UFProgress[] = [],
  ufResults: Map<string, RaceData> = new Map(),
): SecondRoundForecast {
  const [leader, runnerUp] = national.candidates;
  if (!leader || !runnerUp || national.status === 'waiting') {
    return { probability: 0.5, decided: false, leaderMargin: 0, leaderNeeds: 0, method: 'aguardando dados' };
  }

  const margin = leader.percent - runnerUp.percent;

  if (national.status === 'final') {
    return {
      probability: leader.percent > 50 ? 0 : 1,
      decided: true,
      leaderMargin: margin,
      leaderNeeds: 0,
      method: 'resultado final',
    };
  }

  const validCounted = national.validVotes;
  const electorsTotal = national.electorsTotal;
  const electorsCounted = national.electorsCounted;
  const electorsRemaining = Math.max(0, electorsTotal - electorsCounted);

  // Expected remaining valid votes: remaining electors * observed validity rate
  const validityRate = electorsCounted > 0 ? validCounted / electorsCounted : 0.95;
  const remainingValid = electorsRemaining * validityRate;

  // If nothing is left, current = final
  if (remainingValid < 1) {
    return {
      probability: leader.percent > 50 ? 0 : 1,
      decided: true,
      leaderMargin: margin,
      leaderNeeds: 0,
      method: 'tudo apurado',
    };
  }

  // How many extra votes does the leader need beyond their proportional share?
  // Under proportional-remaining, leader final share = current share.
  // To reach 50%: needs share of remaining = (0.5*finalValid - currentVotes)/remainingValid
  const finalValid = validCounted + remainingValid;
  const votesNeeded = 0.5 * finalValid - leader.votes;
  const shareOfRemainingNeeded = votesNeeded / remainingValid;
  const leaderNeeds = shareOfRemainingNeeded; // >1 impossible, <0 already done

  // Uncertainty: the remaining votes are not an iid sample — they come from
  // specific places (the slow UFs) whose political lean differs from the
  // national average. The right variance is over UF-level shares, not
  // individual votes. Model:
  //   leader's final share = (counted votes + Σ_remaining UF votes × p_uf) / finalValid
  // We estimate p_uf per remaining UF from its ALREADY-counted share (data we
  // have via EA14 + per-UF results), falling back to the national share.
  // Sigma ≈ sqrt(Σ (w_uf × σ_uf)²) where w_uf = remaining electors of that UF /
  // total remaining, σ_uf = std error of that UF's estimated share.
  // For UF shares we don't know, use a heterogeneity prior: the observed
  // dispersion of UF-level leader shares (typically 10-15 p.p. in Brazil).
  const p = leader.percent / 100;
  const ufShares: { weight: number; share: number; n: number }[] = [];

  // Use per-UF results when available (map keyed by UF)
  for (const u of ufProgress) {
    const remainingElectorate = Math.max(0, u.electorsTotal - u.electorsCounted);
    if (remainingElectorate <= 0) continue;
    const res = ufResults.get(u.uf);
    const ufLeader = res?.candidates.find((c) => c.id === leader.id);
    const share = ufLeader && res && res.validVotes > 0 ? ufLeader.votes / res.validVotes : p;
    // std error of this UF's share estimate: binomial within UF + unknown-part
    // heterogeneity. If UF is partially counted, uncounted part may differ:
    // inflate by fraction uncounted.
    const fracUncountedUf = remainingElectorate / Math.max(1, u.electorsTotal);
    const nKnown = Math.max(1, res?.validVotes ?? u.electorsCounted * 0.8);
    const binom = Math.sqrt((share * (1 - share)) / nKnown);
    // heterogeneity prior: remaining part of a UF can differ from counted part
    // by a few points; scale with how much is uncounted
    const hetero = 0.05 * fracUncountedUf; // 5 p.p. prior std (late sections differ)
    // cap: a UF share estimate is never worse than 12 p.p. std
    ufShares.push({
      weight: remainingElectorate / Math.max(1, electorsRemaining),
      share,
      n: Math.min(0.12, Math.sqrt(binom * binom + hetero * hetero)),
    });
  }

  // If we have no per-UF data at all, fall back to a national heterogeneity
  // prior: remaining votes' share has std ~ 5 p.p. × fraction remaining.
  let sigma: number;
  if (ufShares.length > 0) {
    // Expected final share: current share + Σ w_uf (share_uf - p) — i.e., the
    // remaining votes shift the leader's share toward the remaining UFs' lean.
    const shift = ufShares.reduce((acc, s) => acc + s.weight * (s.share - p), 0);
    const finalShare = p + shift;
    sigma =
      100 * Math.sqrt(ufShares.reduce((acc, s) => acc + (s.weight * s.n) ** 2, 0));
    const z = sigma > 0 ? (50 - finalShare * 100) / sigma : finalShare <= 0.5 ? 8 : -8;
    const probRunoff = normalCdf(z);
    const decided = leaderNeeds > 1 || leaderNeeds < 0;
    return {
      probability: decided ? (leaderNeeds > 1 ? 1 : 0) : clamp01(probRunoff),
      decided,
      leaderMargin: margin,
      leaderNeeds,
      method: decided
        ? leaderNeeds > 1
          ? 'matematicamente impossível superar 50%'
          : 'matematicamente garantido > 50%'
        : `modelo por UF · share projetado ${(finalShare * 100).toFixed(2).replace('.', ',')}% · σ ≈ ${sigma.toFixed(2)} p.p.`,
    };
  }

  const fracRemaining = electorsRemaining / Math.max(1, electorsTotal);
  sigma = 5 * fracRemaining; // percentage points, heterogeneity prior
  const z = sigma > 0 ? (50 - p * 100) / sigma : p * 100 <= 50 ? 8 : -8;
  const probRunoff = normalCdf(z);
  const decided = leaderNeeds > 1 || leaderNeeds < 0;

  return {
    probability: decided ? (leaderNeeds > 1 ? 1 : 0) : clamp01(probRunoff),
    decided,
    leaderMargin: margin,
    leaderNeeds,
    method: decided
      ? leaderNeeds > 1
        ? 'matematicamente impossível superar 50%'
        : 'matematicamente garantido > 50%'
      : `modelo heterogeneidade · σ ≈ ${sigma.toFixed(2)} p.p. nas ${Math.round(remainingValid).toLocaleString('pt-BR')} restantes`,
  };
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---- Party colors (Brazilian convention) ----
export function partyColor(party: string, coalition: string): string {
  if (/PT|PC do B|PV|Federa/i.test(coalition)) return '#C8102E'; // PT red
  if (/PL|Liberal/i.test(party)) return '#FF8200'; // PL orange-yellow
  if (/PSDB/i.test(party)) return '#0080FF';
  if (/UNIÃO|UNIAO/i.test(party)) return '#0F7B3F';
  if (/MDB|PMDB/i.test(party)) return '#2E7D32';
  if (/PSB/i.test(party)) return '#F5C518';
  if (/REDE/i.test(party)) return '#00A88E';
  if (/ PDT/i.test(party)) return '#8E44AD';
  if (/NOVO/i.test(party)) return '#FF4A4A';
  if (/PP/i.test(party)) return '#5C6BC0';
  if (/CIDADANIA/i.test(party)) return '#EC407A';
  if (/PODE|PODEMOS/i.test(party)) return '#26A69A';
  if (/REPUBLICANOS/i.test(party)) return '#1E88E5';
  if (/PSOL/i.test(party)) return('#E53935');
  if (/PDT/i.test(party)) return '#9C27B0';
  return '#9E9E9E';
}
