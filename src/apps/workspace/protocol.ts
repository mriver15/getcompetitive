/**
 * Client-side protocol for the getcompetitive MCP App: the versioned envelope
 * the server wraps around analytics payloads, and the normalized result types
 * each View renders. Every value is sourced from `structuredContent` — the App
 * never parses the model's text.
 *
 * `parseEnvelope` is the one gate: it checks `schemaVersion` and `view` before
 * anything renders, so a newer server (or a malformed result) lands in the
 * unsupported-schema / error state instead of misreading fields.
 */
import { SCHEMA_VERSION, type AppEnvelope, type AppViewId } from '../envelope.js';

export type { AppEnvelope, AppViewId };

/** Runtime-checked parse of a tool result's `structuredContent`. */
export function parseEnvelope(sc: unknown): AppEnvelope | null {
  if (typeof sc !== 'object' || sc === null) return null;
  const e = sc as Record<string, unknown>;
  if (e.schemaVersion !== SCHEMA_VERSION) return null;
  if (e.view !== 'teamDoctor' && e.view !== 'teamBuilder' && e.view !== 'matchupBoard') return null;
  if (typeof e.tool !== 'string') return null;
  if (typeof e.data !== 'object' || e.data === null) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    view: e.view,
    tool: e.tool,
    mode: typeof e.mode === 'string' ? e.mode : undefined,
    regulation: typeof e.regulation === 'string' ? e.regulation : undefined,
    data: e.data as Record<string, unknown>,
  };
}

// --- Normalized result types (a typed subset of each tool's analytics) ---

export interface SynergyMember {
  species: string;
  types: string[];
  baseSpe: number;
  moveTypes: string[];
}

export interface DefensiveWeakness {
  weak: number;
  resist: number;
  immune: number;
  weakBy: string[];
}

export interface ThreatRow {
  species: string;
  usage: number;
  threatSpeed: number;
  outspeed: boolean;
  hitMultiplier: number;
  hitBy?: string;
  hitVia?: string;
  answered: boolean;
  answerClass?: string;
  answerBy?: string;
}

export interface ThreatCoverage {
  regulation: string;
  sourceAsOf: string;
  fastestSpeed: number;
  threats: ThreatRow[];
  unanswered: string[];
  unansweredCount: number;
  note: string;
}

export interface Score {
  overall: number;
  defensive: number;
  coverage: number;
  speed?: number;
  note: string;
}

export interface SynergyData {
  team?: SynergyMember[];
  defensiveWeaknesses?: Record<string, DefensiveWeakness>;
  atRiskTypes: string[];
  offensiveCoverage?: { coveredBy: Record<string, string[]>; uncoveredSuperEffectively: string[]; note: string };
  speed: { fastest: { species: string; baseSpe: number }; slowest: { species: string; baseSpe: number }; regulation?: string; fasterThreatCount?: number };
  threatCoverage?: ThreatCoverage;
  bringFour?: { opponent: string[]; picks: unknown[]; leftBehind: unknown[]; atRiskTypes: string[]; note: string };
  score: Score;
  unknownMoves?: string[];
}

export interface Problem {
  statement: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
}

export interface CandidateChange {
  kind: 'spread' | 'move' | 'item' | 'member';
  change: string;
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
  dataUpdated?: string;
}

export interface DiagnoseData {
  regulation: string;
  goal?: string;
  problems: Problem[];
  candidateChanges: CandidateChange[];
  unknownMoves?: string[];
  note?: string;
}

export interface Recommendation {
  members: string[];
  roles?: string[];
  score: number;
  reasons: string[];
}

export interface BuilderData {
  regulation: string;
  constraints: {
    types: string[];
    threats: { species: string; usage?: number }[];
    requiredRoles?: string[];
  };
  recommendations: Recommendation[];
  note?: string;
}

export interface LikelySet {
  species: string;
  priority: number | null;
  usage?: number;
  role?: string;
  item?: string;
  ability?: string;
  nature?: string;
  evs?: Record<string, number>;
  moves?: string[];
  note?: string;
}

export interface Race {
  ours: string;
  theirs: string;
  ourSpeed: number;
  theirSpeed: number;
  margin: number;
  weMoveFirst: boolean;
  estimated?: boolean;
}

export interface DamageCalc {
  move: string;
  attacker: string;
  defender: string;
  damageRange: [number, number];
  koChance?: string;
  description: string;
}

export interface LeadPair {
  support: string;
  attacker: string;
  why: string;
}

export interface MatchupData {
  regulation: string;
  opponent: string[];
  likelySets: LikelySet[];
  speedTiers: { ourOrder: string[]; theirOrder: string[]; races: Race[] };
  relevantDamageCalcs: DamageCalc[];
  recommendedBringFour: {
    opponent: string[];
    picks: { species: string; offensive: number; defensive: number; score: number }[];
    leftBehind: { species: string; offensive: number; defensive: number; score: number }[];
    atRiskTypes: string[];
    alternates: { species: string; offensive: number; defensive: number; score: number }[][];
    score: number;
    note: string;
  };
  possibleLeads: { pairs: LeadPair[]; note: string };
  dangerousOpponentLeads: { pairs: LeadPair[]; note: string };
  winConditions: string[];
  lossConditions: string[];
  pokemonToPreserve: string[];
  matchupConfidence: { score: number; note: string };
  note?: string;
}

/** The original tool arguments (team, opponent, regulation, …) the host sent. */
export interface ToolInput {
  [key: string]: unknown;
}
