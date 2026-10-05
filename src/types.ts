// TSE EA20 unified file — raw wire format (subset we consume)
// Numbers arrive as strings with Brazilian decimal commas: "50,20"
export interface TseCandidate {
  n: string; // ballot number
  sqcand: string;
  nm: string; // full name
  nmu: string; // ballot name (urna)
  dvt: string; // vote validity
  seq: string;
  e: 's' | 'n'; // elected
  st: string;
  vap: string; // votes
  pvap: string; // percent "50,20"
  pvapn: string; // percent numeric "50,202838530"
  vs?: { tp: string; sqcand: string; nm: string; nmu: string; sgp: string }[]; // running mates
}

export interface TseParty {
  n: string;
  sg: string;
  nm: string;
  nfed?: string;
  tvtn?: string;
  tvan?: string;
  cand?: TseCandidate[];
}

export interface TseAgrem {
  n: string;
  nm: string;
  tp: string;
  com: string;
  par: TseParty[];
}

export interface TseUnified {
  ele: string;
  t: string;
  f: 'o';
  tpabr: 'br' | 'uf' | 'mu';
  cdabr: string; // 'br' | 'sp' | 'sp61018'
  dg: string; // generation date
  hg: string; // generation time
  idg: string;
  dt: string; // totalization timestamp date
  ht: string; // totalization timestamp time
  and: 'p' | 'f'; // partial | final
  carg: { cd: string; nmn: string; agr: TseAgrem[] }[];
  s: Record<string, string>; // sections: ts total, st totalized, pst "%", snt not totalized...
  e: Record<string, string>; // electorate: te total, est status, c comparecimento, a abstenção
  v: Record<string, string>; // votes: tv, vvc valid, vb blank, vn null...
}

// EA14 acompanhamento (which UFs updated + their progress)
export interface TseAbrUF {
  cdabr: string; // 'ac'
  tpabr?: string; // 'uf' | 'br'
  and: 'p' | 'f';
  dt: string;
  ht: string;
  s: { ts: string; st: string; pst: string; pstn: string };
  e: { te: string; est: string; pest: string; pestn: string; c: string; a: string };
}

export interface TseAcompanhamento {
  ele: string;
  dg: string;
  hg: string;
  idg: string;
  abr: TseAbrUF[];
}

// ---- Normalized app types ----
export interface Candidate {
  id: string;
  ballotName: string;
  fullName: string;
  number: string;
  party: string; // 'PL'
  coalition: string; // 'PT/PC do B/PV'
  votes: number;
  percent: number; // of valid votes
  elected: boolean;
  runningMate?: string;
}

export type RaceStatus = 'waiting' | 'partial' | 'final';

export interface RaceData {
  status: RaceStatus;
  generatedAt: string; // ISO
  sectionsTotal: number;
  sectionsCounted: number;
  electorsTotal: number;
  electorsCounted: number;
  turnout: number; // counted electors who voted
  abstention: number;
  blank: number;
  nullVotes: number;
  validVotes: number;
  candidates: Candidate[];
}

export interface UFProgress {
  uf: string; // 'SP'
  status: RaceStatus;
  percentSections: number; // 0-100
  electorsTotal: number;
  electorsCounted: number;
  updatedAt: string;
}

export interface SecondRoundForecast {
  probability: number; // 0-1 chance top-2 race NOT decided (i.e., runoff happens)
  decided: boolean; // mathematically certain
  leaderMargin: number; // leader % - runner-up %
  leaderNeeds: number; // remaining votes leader-runnerup gap / remaining
  method: string; // human-readable explanation
}
