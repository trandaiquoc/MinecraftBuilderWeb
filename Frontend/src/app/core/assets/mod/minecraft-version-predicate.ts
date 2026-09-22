import type { ModCompatibilityResult } from './mod-loader';

interface ParsedVersion { readonly parts: readonly number[]; readonly prerelease: boolean; }
type PredicateResult = 'match' | 'no-match' | 'unknown';

export function evaluateMinecraftRequirement(requirement: string | readonly string[] | undefined, version: string): ModCompatibilityResult {
  if (!requirement) return { status: 'unknown', reason: 'missing-minecraft-dependency' };
  const expressions = Array.isArray(requirement) ? requirement : [requirement];
  if (!expressions.length || expressions.some((entry) => typeof entry !== 'string' || !entry.trim())) return { status: 'unknown', reason: 'malformed-minecraft-dependency', expression: requirement };
  const target = parseVersion(version);
  if (!target) return { status: 'unknown', reason: 'unsupported-project-version', expression: requirement };
  let sawUnknown = false;
  for (const expression of expressions) {
    const result = evaluateExpression(expression, target);
    if (result === 'match') return { status: 'compatible', reason: 'declared-predicate-matches', expression: requirement };
    if (result === 'unknown') sawUnknown = true;
  }
  return { status: sawUnknown ? 'unknown' : 'incompatible', reason: sawUnknown ? 'unsupported-minecraft-predicate' : 'declared-predicate-excludes-version', expression: requirement };
}

export function assessMinecraftRequirement(requirement: string | readonly string[] | undefined, version: string): ModCompatibilityResult['status'] {
  return evaluateMinecraftRequirement(requirement, version).status;
}

function evaluateExpression(expression: string, target: ParsedVersion): PredicateResult {
  const value = expression.trim();
  if (!value) return 'unknown';
  const bracket = /^\[\s*([^,]+)\s*,\s*([^\]\)]+)\s*([\]\)])$/.exec(value);
  if (bracket) {
    const lower = parseVersion(bracket[1]); const upper = parseVersion(bracket[2]);
    if (!lower || !upper || lower.prerelease || upper.prerelease || target.prerelease) return 'unknown';
    const lowerOk = compare(target, lower) >= 0; const upperOk = bracket[3] === ']' ? compare(target, upper) <= 0 : compare(target, upper) < 0;
    return lowerOk && upperOk ? 'match' : 'no-match';
  }
  const tokens = value.split(/\s+/).filter(Boolean);
  let unknown = false;
  for (const token of tokens) {
    const result = evaluateToken(token, target);
    if (result === 'no-match') return 'no-match';
    if (result === 'unknown') unknown = true;
  }
  return unknown ? 'unknown' : 'match';
}

function evaluateToken(token: string, target: ParsedVersion): PredicateResult {
  if (token === '*') return target.prerelease ? 'unknown' : 'match';
  if (token.startsWith('>=')) return compareToken(token.slice(2), target, (value) => compare(target, value) >= 0);
  if (token.startsWith('<=')) return compareToken(token.slice(2), target, (value) => compare(target, value) <= 0);
  if (token.startsWith('>')) return compareToken(token.slice(1), target, (value) => compare(target, value) > 0);
  if (token.startsWith('<')) return compareToken(token.slice(1), target, (value) => compare(target, value) < 0);
  if (token.startsWith('~')) return rangeToken(token.slice(1), target, 'tilde');
  if (token.startsWith('^')) return rangeToken(token.slice(1), target, 'caret');
  const wildcard = /^(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/.exec(token);
  if (wildcard && [wildcard[2], wildcard[3]].some((part) => part?.toLowerCase() === 'x' || part === '*')) {
    const numbers = [Number(wildcard[1]), wildcard[2] && !/^[xX*]$/.test(wildcard[2]) ? Number(wildcard[2]) : undefined];
    return target.prerelease ? 'unknown' : target.parts[0] === numbers[0] && (numbers[1] === undefined || target.parts[1] === numbers[1]) ? 'match' : 'no-match';
  }
  const exact = parseVersion(token);
  if (!exact || exact.prerelease || target.prerelease) return 'unknown';
  return compare(target, exact) === 0 ? 'match' : 'no-match';
}

function compareToken(raw: string, target: ParsedVersion, predicate: (value: ParsedVersion) => boolean): PredicateResult {
  const value = parseVersion(raw); return value && !value.prerelease && !target.prerelease ? (predicate(value) ? 'match' : 'no-match') : 'unknown';
}
function rangeToken(raw: string, target: ParsedVersion, kind: 'tilde' | 'caret'): PredicateResult {
  const base = parseVersion(raw); if (!base || base.prerelease || target.prerelease) return 'unknown';
  const upper = [...base.parts];
  if (kind === 'tilde') upper[1] = (upper[1] ?? 0) + 1;
  else if ((upper[0] ?? 0) > 0) { upper[0] = (upper[0] ?? 0) + 1; upper[1] = 0; }
  else upper[1] = (upper[1] ?? 0) + 1;
  return compare(target, base) >= 0 && compare(target, { parts: upper, prerelease: false }) < 0 ? 'match' : 'no-match';
}
function parseVersion(value: string): ParsedVersion | undefined {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(value.trim());
  if (!match) return undefined;
  return { parts: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)], prerelease: !!value.match(/-/) };
}
function compare(left: ParsedVersion, right: ParsedVersion): number {
  if (left.prerelease || right.prerelease) return Number.NaN;
  for (let index = 0; index < 3; index++) if (left.parts[index] !== right.parts[index]) return left.parts[index] > right.parts[index] ? 1 : -1;
  return 0;
}
