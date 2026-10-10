import type { BlockBehavior } from '../../blocks/catalog/block-definition.types';
import type {
  BehaviorCandidateSummary,
  BehaviorClassificationSummary,
  BehaviorEvidenceRecord,
  BehaviorFingerprint,
} from './behavior-fingerprint';
import { generateBehaviorCandidates, type BehaviorCandidate } from './behavior-candidate-generator';

interface ScoredCandidate extends BehaviorCandidate {
  readonly score: number;
}

export function matchVanillaBehaviorCandidates(fingerprint: BehaviorFingerprint): {
  readonly behavior?: BlockBehavior;
  readonly family?: string;
  readonly defaults?: Readonly<Record<string, string>>;
  readonly stateDefinitions?: BehaviorCandidate['stateDefinitions'];
  readonly classification: BehaviorClassificationSummary;
} {
  const candidates = generateBehaviorCandidates(fingerprint).map(scoreCandidate);
  const valid = candidates.filter((candidate) => candidate.contradictions.length === 0);
  const ranked = [...valid].sort((left, right) => right.score - left.score);
  const top = ranked[0];
  const runnerUp = ranked[1];
  const evidenceWinner = top && (!runnerUp || top.score - runnerUp.score >= 2) ? top : undefined;
  const nameWinner =
    !evidenceWinner && ranked.length > 1 ? chooseByName(ranked, fingerprint.nameTokens) : undefined;
  const chosen = evidenceWinner ?? nameWinner;
  const selectionReason: BehaviorClassificationSummary['selectionReason'] = evidenceWinner
    ? 'evidence'
    : nameWinner
      ? 'name-tie-break'
      : ranked.length > 1
        ? 'ambiguous'
        : 'none';
  const nameTieBreak = nameWinner
    ? `registry/display alias selected ${nameWinner.family} after evidence tie`
    : undefined;
  const classification: BehaviorClassificationSummary = {
    ...(chosen ? { chosenCandidate: chosen.family } : {}),
    traits: fingerprint.traits,
    supportingEvidence: chosen?.evidence ?? [],
    rejectedCandidates: candidates
      .filter((candidate) => candidate.contradictions.length > 0)
      .map(summarizeCandidate),
    candidates: candidates.map(summarizeCandidate),
    ...(nameTieBreak ? { nameTieBreak } : {}),
    selectionReason,
    confidence: chosen ? (chosen.score >= 6 ? 'strong' : 'partial') : 'unknown',
  };
  return chosen
    ? {
        behavior: chosen.behavior,
        family: chosen.family,
        defaults: chosen.defaults,
        stateDefinitions: chosen.stateDefinitions,
        classification,
      }
    : { classification };
}

function scoreCandidate(candidate: BehaviorCandidate): ScoredCandidate {
  const evidence = candidate.scoreEvidence ?? candidate.evidence;
  return {
    ...candidate,
    score:
      candidate.contradictions.length === 0
        ? evidenceScore(evidence) + candidate.scoreAdjustment
        : 0,
  };
}

function evidenceScore(evidence: readonly BehaviorEvidenceRecord[]): number {
  return evidence.reduce(
    (total, entry) =>
      total + (entry.strength === 'strong' ? 2 : entry.strength === 'partial' ? 1 : 0),
    0,
  );
}

const FAMILY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  walls: ['wall', 'walls'],
  fence: ['fence', 'fences'],
  pane: ['pane', 'panes', 'bar', 'bars', 'iron_bars'],
  stairs: ['stair', 'stairs'],
  'six-face-attachment': ['bud', 'buds', 'cluster', 'clusters'],
  doors: ['door', 'doors'],
  beds: ['bed', 'beds'],
  buttons: ['button', 'buttons'],
  lanterns: ['lantern', 'lanterns'],
  chains: ['chain', 'chains'],
  'standing-sign': ['standing', 'standing_sign'],
  'wall-sign': ['wall', 'wall_sign'],
  'hanging-sign': ['hanging', 'hanging_sign'],
  'wall-hanging-sign': ['wall_hanging', 'wall-hanging'],
};

function chooseByName(
  candidates: readonly ScoredCandidate[],
  tokens: readonly string[],
): ScoredCandidate | undefined {
  const matches = candidates.filter(
    (candidate) =>
      FAMILY_NAME_ALIASES[candidate.family]?.some((alias) => tokens.includes(alias)) === true,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function summarizeCandidate(candidate: ScoredCandidate): BehaviorCandidateSummary {
  return {
    family: candidate.family,
    valid: candidate.contradictions.length === 0,
    score: candidate.score,
    evidence: candidate.evidence,
    contradictions: candidate.contradictions,
  };
}
