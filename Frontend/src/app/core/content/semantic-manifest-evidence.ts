import type { AssetResourceProvider } from '../blocks/resolver/resolver.types';
import type { BlockCapabilityProfile } from '../blocks/capabilities/block-capability.types';
import type { PlacementSupportRequirement } from '../blocks/catalog/block-definition.types';
import type {
  ContentIntrospectionDiagnostic,
  ContentItemHostVisualDescriptor,
  ContentItemHostVisualSlot,
  ContentPropertyEffects,
  ContentPropertySupplement,
  ContentSemanticEvidenceProvider,
  ContentSemanticSupplement,
  ContentSpecialVisualDescriptor,
} from './content-semantic-types';

/** Reads the optional MinecraftBuilder-owned semantic manifest without making
 * assumptions about the namespace or loader that supplied the resources. */
export class SemanticManifestEvidenceProvider implements ContentSemanticEvidenceProvider {
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
  private readonly entries: readonly ContentSemanticSupplement[];

  constructor(
    provider: Pick<AssetResourceProvider, 'readJson'>,
    sourceId?: string,
    sourceName = sourceId ?? 'content source',
  ) {
    const path = [
      'data/minecraftbuilder/semantic-manifest.json',
      'assets/minecraftbuilder/semantic-manifest.json',
    ].find((candidate) => provider.readJson(candidate) !== undefined);
    if (!path) {
      this.entries = [];
      this.diagnostics = [];
      return;
    }
    const parsed = parseSemanticManifest(provider.readJson(path), sourceId, sourceName, path);
    this.entries = parsed.entries;
    this.diagnostics = parsed.diagnostics;
  }

  supplementsFor(contentId: string, sourceId?: string): readonly ContentSemanticSupplement[] {
    return this.entries.filter(
      (entry) => entry.id === contentId && (!entry.sourceId || entry.sourceId === sourceId),
    );
  }
}

export interface SemanticManifestParseResult {
  readonly entries: readonly ContentSemanticSupplement[];
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
}

export function parseSemanticManifest(
  raw: unknown,
  sourceId?: string,
  sourceName = sourceId ?? 'content source',
  resource = 'data/minecraftbuilder/semantic-manifest.json',
): SemanticManifestParseResult {
  const diagnostics: ContentIntrospectionDiagnostic[] = [];
  if (!isRecord(raw) || raw['schemaVersion'] !== 1 || !isRecord(raw['content'])) {
    return {
      entries: [],
      diagnostics: [
        {
          code: 'malformed-resource',
          message: `Invalid semantic manifest from ${sourceName}; expected schemaVersion 1 and a content object.`,
          resource,
          sourceId,
        },
      ],
    };
  }
  const entries: ContentSemanticSupplement[] = [];
  for (const [id, value] of Object.entries(raw['content'])) {
    if (!isRecord(value)) {
      diagnostics.push({
        code: 'malformed-resource',
        message: `Semantic manifest entry ${id} is not an object.`,
        resource,
        sourceId,
      });
      continue;
    }
    const properties = parsePropertySupplements(
      value['properties'],
      diagnostics,
      id,
      resource,
      sourceId,
    );
    const capabilities = Array.isArray(value['capabilities'])
      ? (value['capabilities'].filter(isRecord) as unknown as BlockCapabilityProfile)
      : undefined;
    const supportRequirements = Array.isArray(value['supportRequirements'])
      ? value['supportRequirements'].filter(isSupportRequirement)
      : undefined;
    const supportContracts = Array.isArray(value['supportContracts'])
      ? value['supportContracts'].filter((item): item is string => typeof item === 'string')
      : undefined;
    const specialVisual = parseSpecialVisual(value['specialVisual']);
    if (value['specialVisual'] !== undefined && !specialVisual)
      diagnostics.push({
        code: 'malformed-resource',
        message: `Semantic manifest special visual for ${id} is malformed.`,
        resource,
        sourceId,
      });
    const itemHostVisual = parseItemHostVisual(value['itemHostVisual']);
    if (value['itemHostVisual'] !== undefined && !itemHostVisual)
      diagnostics.push({
        code: 'malformed-resource',
        message: `Semantic manifest item host visual for ${id} is malformed.`,
        resource,
        sourceId,
      });
    const defaultState = isStringRecord(value['defaultState']) ? value['defaultState'] : undefined;
    entries.push({
      id,
      ...(sourceId ? { sourceId } : {}),
      properties,
      defaultState,
      capabilities,
      supportRequirements,
      supportContracts,
      ...(specialVisual ? { specialVisual } : {}),
      ...(itemHostVisual ? { itemHostVisual } : {}),
      semanticEvidence: [
        {
          contractId: 'minecraftbuilder:semantic-manifest',
          provenance: 'trusted-data',
          strength: 'strong',
          supportingTags: [],
          supportingProperties: properties.map((property) => property.name),
          supportingResources: [resource],
        },
      ],
    });
  }
  return { entries, diagnostics };
}

function parsePropertySupplements(
  value: unknown,
  diagnostics: ContentIntrospectionDiagnostic[],
  id: string,
  resource: string,
  sourceId?: string,
): readonly ContentPropertySupplement[] {
  if (value === undefined) return [];
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'malformed-resource',
      message: `Semantic manifest properties for ${id} must be an object.`,
      resource,
      sourceId,
    });
    return [];
  }
  return Object.entries(value).flatMap(([name, raw]): ContentPropertySupplement[] => {
    if (
      !isRecord(raw) ||
      !Array.isArray(raw['values']) ||
      !raw['values'].every((entry) => typeof entry === 'string')
    ) {
      diagnostics.push({
        code: 'malformed-resource',
        message: `Semantic manifest property ${id}.${name} is malformed.`,
        resource,
        sourceId,
      });
      return [];
    }
    return [
      {
        name,
        values: raw['values'] as string[],
        ...(typeof raw['defaultValue'] === 'string' ? { defaultValue: raw['defaultValue'] } : {}),
        ...(typeof raw['derived'] === 'boolean' ? { derived: raw['derived'] } : {}),
        ...(isRecord(raw['effects'])
          ? { effects: raw['effects'] as Partial<ContentPropertyEffects> }
          : {}),
        provenance: 'trusted-data',
        evidence: [resource],
      },
    ];
  });
}

function isSupportRequirement(value: unknown): value is PlacementSupportRequirement {
  return (
    isRecord(value) &&
    value['evidence'] === 'verified' &&
    typeof value['contractId'] === 'string' &&
    ['below', 'above', 'north', 'east', 'south', 'west'].includes(String(value['direction']))
  );
}
function parseSpecialVisual(value: unknown): ContentSpecialVisualDescriptor | undefined {
  if (
    !isRecord(value) ||
    typeof value['contractId'] !== 'string' ||
    !isRecord(value['resources']) ||
    !Object.values(value['resources']).every((entry) => typeof entry === 'string')
  )
    return undefined;
  const stateDependencies = Array.isArray(value['stateDependencies'])
    ? value['stateDependencies'].filter((entry): entry is string => typeof entry === 'string')
    : [];
  const variant = ['standing', 'wall', 'hanging', 'wall-hanging'].includes(String(value['variant']))
    ? (value['variant'] as ContentSpecialVisualDescriptor['variant'])
    : undefined;
  return {
    contractId: value['contractId'],
    resources: value['resources'] as Record<string, string>,
    stateDependencies,
    ...(variant ? { variant } : {}),
    ...(isRecord(value['parameters']) ? { parameters: value['parameters'] } : {}),
    provenance: 'trusted-data',
  };
}
function parseItemHostVisual(value: unknown): ContentItemHostVisualDescriptor | undefined {
  if (!isRecord(value) || !Array.isArray(value['slots'])) return undefined;
  const slots = value['slots'].map((entry): ContentItemHostVisualSlot | undefined => {
    if (!isRecord(entry) || !Number.isInteger(entry['index']) || Number(entry['index']) < 0)
      return undefined;
    const position = vectorTuple(entry['position'] ?? entry['translation']);
    const rotation = vectorTuple(entry['rotation']);
    const scale = vectorTuple(entry['scale']);
    if (
      ((entry['position'] ?? entry['translation']) !== undefined && !position) ||
      (entry['rotation'] !== undefined && !rotation) ||
      (entry['scale'] !== undefined && !scale)
    )
      return undefined;
    return {
      index: Number(entry['index']),
      ...(position ? { position } : {}),
      ...(rotation ? { rotation } : {}),
      ...(scale ? { scale } : {}),
    };
  });
  return slots.every((slot): slot is ContentItemHostVisualSlot => !!slot)
    ? { slots: slots as ContentItemHostVisualSlot[], provenance: 'trusted-data' }
    : undefined;
}
function vectorTuple(value: unknown): readonly [number, number, number] | undefined {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    ? [value[0] as number, value[1] as number, value[2] as number]
    : undefined;
}
function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
