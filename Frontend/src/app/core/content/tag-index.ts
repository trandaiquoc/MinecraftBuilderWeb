import type { AssetResourceProvider } from '../blocks/resolver/resolver.types';
import { resolveResourceLocation } from './resource-location';

export type TagDomain = 'block' | 'item' | 'painting_variant';
export type TagDiagnosticCode = 'tag-cycle' | 'unresolved-tag-reference' | 'missing-optional-tag-member' | 'tag-replacement-unsupported' | 'malformed-tag';

export interface TagDiagnostic {
  readonly code: TagDiagnosticCode;
  readonly message: string;
  readonly tagId?: string;
  readonly sourceId?: string;
  readonly path?: string;
}

export interface TagValueEvidence {
  readonly id: string;
  readonly required: boolean;
  readonly isTag: boolean;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly raw: unknown;
}

export interface TagContribution {
  readonly id: string;
  readonly domain: TagDomain;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly path: string;
  readonly replace: boolean;
  readonly values: readonly TagValueEvidence[];
}

export interface ResolvedTagMember {
  readonly id: string;
  readonly required: boolean;
  readonly present: boolean;
  readonly sources: readonly string[];
}

export interface NormalizedTag {
  readonly id: string;
  readonly domain: TagDomain;
  readonly contributions: readonly TagContribution[];
  readonly members: readonly ResolvedTagMember[];
  readonly diagnostics: readonly TagDiagnostic[];
}

const TAG_PATH = /^data\/([^/]+)\/tags\/(block|item|painting_variant)\/(.+)\.json$/;

/**
 * Normalizes block/item/painting tags from one or more active resource sources.
 * The index is deliberately independent from behavior contracts: callers use
 * membership as evidence, then still validate the relevant state/resource shape.
 */
export class TagIndex {
  private readonly contributionsByTag = new Map<string, TagContribution[]>();
  private readonly diagnosticsValue: TagDiagnostic[] = [];
  private readonly resolvedCache = new Map<string, NormalizedTag>();
  private readonly knownMembers = new Map<TagDomain, Set<string>>([
    ['block', new Set<string>()], ['item', new Set<string>()], ['painting_variant', new Set<string>()],
  ]);

  constructor(providers: readonly AssetResourceProvider[] = []) {
    for (const provider of providers) this.addProvider(provider);
  }

  static fromProvider(provider: AssetResourceProvider): TagIndex { return new TagIndex([provider]); }

  addProvider(provider: AssetResourceProvider): void {
    this.resolvedCache.clear();
    const source = sourceMetadata(provider);
    for (const path of provider.paths?.() ?? []) {
      recordKnownMember(path, this.knownMembers);
      const match = TAG_PATH.exec(path);
      if (!match) continue;
      const domain = match[2] as TagDomain;
      const id = `${match[1]}:${match[3]}`;
      const raw = provider.readJson(path);
      if (!isRecord(raw)) {
        this.diagnosticsValue.push({ code: 'malformed-tag', message: 'Tag resource must be a JSON object.', tagId: id, sourceId: source.id, path });
        continue;
      }
      const rawValues = raw['values'];
      if (!Array.isArray(rawValues)) {
        this.diagnosticsValue.push({ code: 'malformed-tag', message: 'Tag resource values must be an array.', tagId: id, sourceId: source.id, path });
        continue;
      }
      const values = rawValues.flatMap((value): TagValueEvidence[] => {
        const parsed = parseTagValue(value, domain, source, id);
        return parsed ? [parsed] : [];
      });
      const contribution: TagContribution = { id, domain, sourceId: source.id, sourceName: source.name, path, replace: raw['replace'] === true, values };
      const key = tagKey(domain, id);
      this.contributionsByTag.set(key, [...(this.contributionsByTag.get(key) ?? []), contribution]);
      if (contribution.replace) this.diagnosticsValue.push({ code: 'tag-replacement-unsupported', message: 'replace:true is preserved but not applied without an explicit load-order policy.', tagId: id, sourceId: source.id, path });
    }
  }

  get(domain: TagDomain, id: string): NormalizedTag {
    const tagId = normalizeTagId(id);
    const cached = this.resolvedCache.get(tagKey(domain, tagId));
    if (cached) return cached;
    const contributions = this.contributionsByTag.get(tagKey(domain, tagId)) ?? [];
    const localDiagnostics: TagDiagnostic[] = [];
    const members = this.resolveMembers(domain, tagId, new Set(), localDiagnostics);
    const normalized = { id: tagId, domain, contributions: [...contributions], members, diagnostics: localDiagnostics };
    this.resolvedCache.set(tagKey(domain, tagId), normalized);
    return normalized;
  }

  hasMember(domain: TagDomain, tagId: string, memberId: string): boolean {
    return this.get(domain, tagId).members.some((member) => member.id === normalizeMemberId(memberId) && member.present);
  }

  contributions(domain?: TagDomain): readonly TagContribution[] {
    return [...this.contributionsByTag.values()].flat().filter((entry) => !domain || entry.domain === domain);
  }

  diagnostics(): readonly TagDiagnostic[] { return [...this.diagnosticsValue]; }

  private resolveMembers(domain: TagDomain, id: string, stack: ReadonlySet<string>, diagnostics: TagDiagnostic[]): readonly ResolvedTagMember[] {
    const key = tagKey(domain, id);
    if (stack.has(key)) {
      diagnostics.push({ code: 'tag-cycle', message: `Circular tag reference detected at ${id}.`, tagId: id });
      return [];
    }
    const allContributions = this.contributionsByTag.get(key) ?? [];
    const replacementIndex = allContributions.reduce((index, contribution, current) => contribution.replace ? current : index, -1);
    const contributions = replacementIndex >= 0 ? allContributions.slice(replacementIndex) : allContributions;
    if (!contributions.length) {
      diagnostics.push({ code: 'unresolved-tag-reference', message: `Missing tag resource: ${id}.`, tagId: id });
      return [];
    }
    const nextStack = new Set(stack); nextStack.add(key);
    const members = new Map<string, ResolvedTagMember>();
    for (const contribution of contributions) for (const value of contribution.values) {
      if (value.isTag) {
        const nested = this.resolveMembers(domain, value.id, nextStack, diagnostics);
        for (const member of nested) members.set(member.id, mergeMember(members.get(member.id), member, value.required));
        continue;
      }
      const present = this.knownMembers.get(domain)?.has(value.id) ?? true;
      if (!present && !value.required) diagnostics.push({ code: 'missing-optional-tag-member', message: `Optional tag member is not available in retained resources: ${value.id}.`, tagId: id, sourceId: value.sourceId });
      if (!present && value.required) diagnostics.push({ code: 'unresolved-tag-reference', message: `Required tag member is not available in retained resources: ${value.id}.`, tagId: id, sourceId: value.sourceId });
      members.set(value.id, mergeMember(members.get(value.id), { id: value.id, required: value.required, present, sources: [value.sourceId] }, value.required));
    }
    return [...members.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
}

function parseTagValue(value: unknown, domain: TagDomain, source: { readonly id: string; readonly name: string }, tagId: string): TagValueEvidence | undefined {
  const object = isRecord(value) ? value : undefined;
  const rawId = typeof value === 'string' ? value : object && typeof object['id'] === 'string' ? object['id'] : object && typeof object['value'] === 'string' ? object['value'] : undefined;
  if (!rawId) return undefined;
  const isTag = rawId.startsWith('#');
  const id = resolveResourceLocation(isTag ? rawId.slice(1) : rawId, 'minecraft');
  if (!id) return undefined;
  return { id, required: object?.['required'] !== false, isTag, sourceId: source.id, sourceName: source.name, raw: value };
}

function normalizeTagId(value: string): string { return resolveResourceLocation(value.replace(/^#/, ''), 'minecraft') ?? value; }
function normalizeMemberId(value: string): string { return resolveResourceLocation(value.replace(/^#/, ''), 'minecraft') ?? value; }
function tagKey(domain: TagDomain, id: string): string { return `${domain}:${id}`; }
function sourceMetadata(provider: AssetResourceProvider): { readonly id: string; readonly name: string } { const source = (provider as { readonly source?: { readonly id?: string; readonly displayName?: string } }).source; return { id: source?.id ?? 'unknown', name: source?.displayName ?? source?.id ?? 'Unknown' }; }
function mergeMember(existing: ResolvedTagMember | undefined, incoming: ResolvedTagMember, required: boolean): ResolvedTagMember {
  if (!existing) return { ...incoming, required, sources: [...new Set(incoming.sources)] };
  return { id: existing.id, required: existing.required || required, present: existing.present || incoming.present, sources: [...new Set([...existing.sources, ...incoming.sources])] };
}
function recordKnownMember(path: string, known: ReadonlyMap<TagDomain, Set<string>>): void {
  let match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path);
  if (match) { known.get('block')?.add(`${match[1]}:${match[2]}`); return; }
  match = /^assets\/([^/]+)\/(?:items|models\/item)\/(.+)\.json$/.exec(path);
  if (match) { known.get('item')?.add(`${match[1]}:${match[2]}`); return; }
  match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path);
  if (match) known.get('painting_variant')?.add(`${match[1]}:${match[2]}`);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
