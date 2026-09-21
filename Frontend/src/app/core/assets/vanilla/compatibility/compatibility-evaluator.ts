import { BlockCatalog } from '../../../blocks/catalog/block-catalog';
import type { BlockDefinition } from '../../../blocks/catalog/block-definition.types';
import { BlockModelResolver } from '../../../blocks/resolver';
import { evaluateCommonBehavior } from '../../../block-behavior/compatibility/common-behavior';
import { SpecialBlockVisualRegistry } from '../../../renderer/visuals/special-block-visuals';
import type { PlacedBlock } from '../../../domain/project.types';
import { CompatibilityClassification, CompatibilityEntry, CompatibilityReport } from './compatibility.types';
import type { VanillaAssetProvider } from '../vanilla-asset-provider';

export function evaluateCompatibility(provider: VanillaAssetProvider): CompatibilityReport {
  const catalog = new BlockCatalog();
  catalog.load(provider.catalog());
  const resolver = new BlockModelResolver(provider);
  const specialVisuals = new SpecialBlockVisualRegistry(provider);
  const groups: Record<CompatibilityClassification, CompatibilityEntry[]> = { 'compatible-reused': [], 'changed-needs-delta': [], 'new-generic-supported': [], unsupported: [] };
  for (const definition of catalog.all()) {
    const entry = evaluateDefinition(provider, definition, resolver, specialVisuals);
    groups[entry.classification].push(entry);
  }
  const sort = (items: CompatibilityEntry[]): readonly CompatibilityEntry[] => [...items].sort((left, right) => left.id.localeCompare(right.id));
  const compatibleReused = sort(groups['compatible-reused']);
  const changedNeedsDelta = sort(groups['changed-needs-delta']);
  const newGenericSupported = sort(groups['new-generic-supported']);
  const unsupported = sort(groups.unsupported);
  return {
    schemaVersion: 1,
    minecraftVersion: provider.minecraftVersion,
    generatedAt: new Date().toISOString(),
    resourceFormat: provider.diagnostics().resourceFormat,
    summary: { compatibleReused: compatibleReused.length, changedNeedsDelta: changedNeedsDelta.length, newGenericSupported: newGenericSupported.length, unsupported: unsupported.length },
    compatibleReused,
    changedNeedsDelta,
    newGenericSupported,
    unsupported,
  };
}

function evaluateDefinition(provider: VanillaAssetProvider, definition: BlockDefinition, resolver: BlockModelResolver, specialVisuals: SpecialBlockVisualRegistry): CompatibilityEntry {
  const resolved = resolver.resolve(definition.id, definition.defaultState, 'compatibility');
  const common = evaluateCommonBehavior({ ...definition, resources: definition.resources }, provider);
  const probe: PlacedBlock = { kind: 'resolved', id: definition.id, namespace: definition.namespace, position: { x: 0, y: 0, z: 0 }, state: definition.defaultState };
  const special = specialVisuals.inspect(probe);
  const variantPairs = definition.behavior?.kind === 'standing-sign' || definition.behavior?.kind === 'hanging-sign' ? [definition.behavior.wallBlockId] : undefined;
  const family = common?.family ?? familyFromDefinition(definition);
  const base = {
    minecraftVersion: provider.minecraftVersion,
    id: definition.id,
    family,
    resourceFormat: provider.diagnostics().resourceFormat.support,
    blockstatePath: definition.resources.blockstate,
    modelIds: resolved.trace.selectedModelIds,
    unresolvedModels: resolved.diagnostics.filter((item) => item.code === 'missing-model' || item.code === 'missing-parent' || item.code === 'parent-cycle').map((item) => item.resource ?? item.message),
    textureResources: resolved.trace.textureResources,
    resolverSupport: resolved.support,
    visualClassification: definition.visualClassification,
    behaviorSupport: definition.behaviorSupport,
    defaultStateSource: definition.defaultStateSource,
    ...(definition.behavior ? { behaviorImplementation: definition.behavior.kind, behaviorCompatibility: 'reused' as const } : { behaviorCompatibility: 'unknown' as const }),
    logicalObjectCompatibility: definition.behavior?.kind === 'double-height' || definition.behavior?.kind === 'paired-horizontal' ? 'reused' : 'not-applicable',
    ...(special.family ? { specialRendererFamily: special.family, specialRendererCompatibility: special.missingResources.length ? 'missing-resource' as const : 'reused' as const, ...(special.missingResources.length ? { missingResources: special.missingResources } : {}) } : { specialRendererCompatibility: 'not-applicable' as const }),
    ...(variantPairs ? { variantPairs } : {}),
    stateContract: definition.stateDefinitions.map((entry) => `${entry.name}=${entry.values.join('|')}`),
    itemEvidence: definition.itemEvidence ? 'observed' as const : 'unobserved' as const,
    ...(definition.itemEvidence ? { itemId: definition.itemEvidence.itemId, itemEligibility: 'placeable' as const } : { itemEligibility: 'internal-or-unobserved' as const }),
  } satisfies Omit<CompatibilityEntry, 'classification'>;
  if (common?.reason) return { ...base, classification: 'changed-needs-delta', reasonCode: 'STATE_CONTRACT_CHANGED', message: common.reason, actualProperties: definition.stateDefinitions.map((entry) => entry.name) };
  if (special.family && special.missingResources.length) return { ...base, classification: 'changed-needs-delta', reasonCode: 'MISSING_SPECIAL_RESOURCE', message: `Special renderer ${special.family} is known but required resources are missing.`, missingResources: special.missingResources };
  if (special.family) return { ...base, classification: 'compatible-reused', message: `Special renderer ${special.family} is compatible with the target resources.` };
  if (common?.compatible || definition.defaultStateSource === 'compatible-common') return { ...base, classification: 'compatible-reused', message: 'Common behavior contract matched the target resource state.' };
  if ((definition.defaultStateSource === 'authoritative-report' || definition.defaultStateSource === 'verified-fixture' || definition.behaviorSupport !== 'unknown') && resolved.parts.length && !hasBlockingDiagnostic(resolved.diagnostics)) return { ...base, classification: 'compatible-reused', message: 'Verified behavior and compatible target resources were reused.' };
  if (resolved.parts.length && !hasBlockingDiagnostic(resolved.diagnostics)) return { ...base, classification: 'new-generic-supported', message: 'Generic blockstate/model pipeline resolved this block.' };
  return { ...base, classification: 'unsupported', reasonCode: resolved.diagnostics[0]?.code ?? 'NO_RENDERABLE_RESOURCE', message: resolved.diagnostics[0]?.message ?? 'No supported generic resource path was found.' };
}

function hasBlockingDiagnostic(diagnostics: readonly { readonly code: string }[]): boolean { return diagnostics.some((item) => ['missing-model', 'missing-parent', 'parent-cycle', 'malformed-model', 'unsupported-model-behavior'].includes(item.code)); }
function familyFromDefinition(definition: BlockDefinition): string | undefined {
  const behavior = definition.behavior;
  if (behavior?.kind === 'horizontal-connect') return behavior.family;
  if (behavior?.kind === 'stairs') return 'stairs';
  if (behavior?.kind === 'double-height') return 'double-height';
  if (behavior?.kind === 'button') return 'buttons';
  return undefined;
}
