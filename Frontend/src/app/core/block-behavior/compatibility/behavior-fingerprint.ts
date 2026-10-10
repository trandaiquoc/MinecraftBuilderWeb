import type {
  AssetBlockRecord,
  BlockStateDefinition,
} from '../../blocks/catalog/block-definition.types';
import type {
  ContentPropertyDescriptor,
  NormalizedContentDescriptor,
} from '../../content/content-introspection';
import { GENERIC_BEHAVIOR_PROFILES } from './behavior-profiles';
import { inferBehaviorTraits } from './behavior-traits';

const SIX_FACE_VALUES: readonly string[] =
  GENERIC_BEHAVIOR_PROFILES.attachedSixFace.requiredStates.facing;

export type BehaviorTrait =
  | 'horizontal-connection'
  | 'neighbor-derived-shape'
  | 'six-face-orientation'
  | 'face-attachment'
  | 'floor-support'
  | 'ceiling-support'
  | 'axis-orientation'
  | 'waterloggable'
  | 'multi-block'
  | 'block-entity'
  | 'solid-support-provider';

export interface BehaviorEvidenceRecord {
  readonly source:
    'tag' | 'jvm' | 'state-schema' | 'blockstate' | 'model' | 'relationship' | 'support' | 'name';
  readonly strength: 'strong' | 'partial' | 'weak';
  readonly detail: string;
}

export interface BehaviorCandidateSummary {
  readonly family: string;
  readonly valid: boolean;
  readonly score: number;
  readonly evidence: readonly BehaviorEvidenceRecord[];
  readonly contradictions: readonly string[];
}

export interface BehaviorClassificationSummary {
  readonly chosenCandidate?: string;
  readonly traits: readonly BehaviorTrait[];
  readonly supportingEvidence: readonly BehaviorEvidenceRecord[];
  readonly rejectedCandidates: readonly BehaviorCandidateSummary[];
  readonly candidates: readonly BehaviorCandidateSummary[];
  readonly nameTieBreak?: string;
  readonly selectionReason: 'evidence' | 'name-tie-break' | 'ambiguous' | 'none';
  readonly confidence: 'strong' | 'partial' | 'unknown';
}

export interface BehaviorFingerprint {
  readonly id: string;
  readonly displayName: string;
  readonly behaviorEvidenceRequired?: boolean;
  readonly properties: readonly BlockStateDefinition[];
  readonly defaultState: Readonly<Record<string, string>>;
  readonly modelChangingProperties: readonly string[];
  readonly predicates: readonly string[];
  readonly modelReferences: readonly string[];
  readonly modelParents: readonly string[];
  readonly trustedFamilies: readonly string[];
  readonly tags: readonly string[];
  readonly itemBlockRelationship?: string;
  readonly capabilities: readonly string[];
  readonly supportContracts: readonly string[];
  readonly supportRequirements: readonly string[];
  readonly evidence: readonly BehaviorEvidenceRecord[];
  readonly traits: readonly BehaviorTrait[];
  readonly nameTokens: readonly string[];
}

export interface BehaviorFingerprintResourceProvider {
  readJson(path: string): unknown | undefined;
}

export function extractBehaviorFingerprint(
  record: AssetBlockRecord,
  resources?: BehaviorFingerprintResourceProvider,
  descriptor?: NormalizedContentDescriptor,
): BehaviorFingerprint {
  const properties = descriptor?.properties?.map(toStateDefinition) ?? record.stateDefinitions;
  const blockstate = record.resources.blockstate
    ? resources?.readJson(record.resources.blockstate)
    : undefined;
  const modelReferences = uniqueStrings([
    record.resources.model,
    ...collectStrings(blockstate, 'model'),
    ...(record.itemEvidence?.referencedModels ?? []),
  ]);
  const modelParents = collectModelParents(modelReferences, resources);
  const predicates = uniqueStrings([
    ...collectPredicateProperties(blockstate),
    ...(descriptor?.predicates ?? []).flatMap((predicate) => predicateProperties(predicate)),
  ]);
  const modelChangingProperties = uniqueStrings([
    ...(descriptor?.properties
      ?.filter((property) => property.derived || property.effects.visual)
      .map((property) => property.name) ??
      properties.filter((property) => property.derived).map((property) => property.name)),
    ...predicates,
  ]);
  const tags = uniqueStrings([
    ...(record.semanticEvidence ?? []).flatMap((entry) => entry.supportingTags),
    ...(descriptor?.semanticEvidence ?? []).flatMap((entry) => entry.supportingTags),
  ]);
  const semanticAttachmentContracts = [
    ...(record.semanticEvidence ?? []),
    ...(descriptor?.semanticEvidence ?? []),
  ]
    .filter(
      (entry) =>
        entry.strength === 'strong' &&
        (entry.provenance === 'trusted-data' || entry.provenance === 'authoritative-registry'),
    )
    .map((entry) => entry.contractId)
    .filter((contractId) => contractId === 'six-face-attachment');
  const supportContracts = uniqueStrings([
    ...(record.supportContracts ?? []),
    ...(descriptor?.supportContracts ?? []),
    ...semanticAttachmentContracts,
  ]);
  const supportRequirements = uniqueStrings([
    ...(record.supportRequirements ?? []).map(
      (requirement) => `${requirement.direction}:${requirement.contractId}`,
    ),
    ...(descriptor?.supportRequirements ?? []).map(
      (requirement) => `${requirement.direction}:${requirement.contractId}`,
    ),
  ]);
  const evidence: BehaviorEvidenceRecord[] = [
    {
      source: 'state-schema',
      strength: 'strong',
      detail: `properties:${properties.map((property) => `${property.name}=${property.values.join('|')}`).join(';')}`,
    },
    ...(predicates.length
      ? [
          {
            source: 'blockstate' as const,
            strength: 'strong' as const,
            detail: `model predicates:${predicates.join(',')}`,
          },
        ]
      : []),
    ...(modelParents.length
      ? [
          {
            source: 'model' as const,
            strength: 'strong' as const,
            detail: `parents:${modelParents.join(',')}`,
          },
        ]
      : []),
    ...(tags.length
      ? [{ source: 'tag' as const, strength: 'strong' as const, detail: `tags:${tags.join(',')}` }]
      : []),
    ...(supportContracts.length
      ? [
          {
            source: 'support' as const,
            strength: 'strong' as const,
            detail: `contracts:${supportContracts.join(',')}`,
          },
        ]
      : []),
    ...(record.itemEvidence?.placeable
      ? [
          {
            source: 'relationship' as const,
            strength: 'partial' as const,
            detail: `item:${record.itemEvidence.itemId}`,
          },
        ]
      : []),
  ];
  const base: Omit<BehaviorFingerprint, 'traits'> = {
    id: record.id,
    displayName: record.displayName,
    ...(record.behaviorEvidenceRequired !== undefined
      ? { behaviorEvidenceRequired: record.behaviorEvidenceRequired }
      : {}),
    properties,
    defaultState: { ...record.defaultState },
    modelChangingProperties,
    predicates,
    modelReferences,
    modelParents,
    trustedFamilies: uniqueStrings(record.trustedBehaviorFamilies ?? []),
    tags,
    ...(record.itemEvidence?.itemId ? { itemBlockRelationship: record.itemEvidence.itemId } : {}),
    capabilities: uniqueStrings([
      ...(record.capabilities ?? []).map((capability) => capability.kind),
      ...(descriptor?.capabilities ?? []),
    ]),
    supportContracts,
    supportRequirements,
    evidence,
    nameTokens: nameTokens(record.id, record.displayName),
  };
  return { ...base, traits: inferBehaviorTraits(base) };
}

function toStateDefinition(property: ContentPropertyDescriptor): BlockStateDefinition {
  return {
    name: property.name,
    values: property.values,
    ...(property.derived ? { derived: true } : {}),
  };
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function nameTokens(id: string, displayName: string): readonly string[] {
  return `${id} ${displayName}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function collectStrings(value: unknown, key: string): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (childKey === key && typeof child === 'string') found.push(child);
      visit(child);
    }
  };
  visit(value);
  return found;
}

function collectPredicateProperties(value: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'variants' && child && typeof child === 'object' && !Array.isArray(child)) {
        for (const variant of Object.keys(child))
          for (const part of variant.split(',')) {
            const [property, value] = part.trim().split('=', 2);
            if (property) {
              found.push(property);
              if (value && SIX_FACE_VALUES.includes(value)) found.push(`${property}:${value}`);
            }
          }
      } else if (key === 'when' && child && typeof child === 'object' && !Array.isArray(child)) {
        found.push(...Object.keys(child));
      }
      visit(child);
    }
  };
  visit(value);
  return uniqueStrings(found);
}

function predicateProperties(predicate: {
  readonly kind?: string;
  readonly properties?: readonly { readonly property: string }[];
  readonly predicates?: readonly unknown[];
}): string[] {
  return predicate.kind === 'properties'
    ? (predicate.properties ?? []).map((entry) => entry.property)
    : (predicate.predicates ?? []).flatMap((entry) =>
        predicateProperties(
          entry as {
            kind?: string;
            properties?: readonly { readonly property: string }[];
            predicates?: readonly unknown[];
          },
        ),
      );
}

function collectModelParents(
  models: readonly string[],
  resources?: BehaviorFingerprintResourceProvider,
): string[] {
  if (!resources) return [];
  const parents = new Set<string>();
  const visit = (model: string, visited: Set<string>): void => {
    const path = modelResourcePath(model);
    if (!path || visited.has(path)) return;
    visited.add(path);
    const document = resources.readJson(path);
    if (!document || typeof document !== 'object' || Array.isArray(document)) return;
    const parent = (document as Record<string, unknown>)['parent'];
    if (typeof parent !== 'string') return;
    parents.add(parent.replace(/^minecraft:/, ''));
    visit(parent, visited);
  };
  models.forEach((model) => visit(model, new Set<string>()));
  return [...parents];
}

function modelResourcePath(model: string): string | undefined {
  if (model.startsWith('assets/')) return model.endsWith('.json') ? model : `${model}.json`;
  const separator = model.indexOf(':');
  if (separator <= 0) return undefined;
  return `assets/${model.slice(0, separator)}/models/${model.slice(separator + 1).replace(/^models\//, '')}.json`;
}
