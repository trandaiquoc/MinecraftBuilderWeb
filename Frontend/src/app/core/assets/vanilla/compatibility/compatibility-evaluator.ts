import { BlockCatalog } from '../../../blocks/catalog/block-catalog';
import type { BlockDefinition } from '../../../blocks/catalog/block-definition.types';
import { BlockModelResolver } from '../../../blocks/resolver';
import { evaluateCommonBehavior } from '../../../block-behavior/compatibility/common-behavior';
import { CompatibilityClassification, CompatibilityEntry, CompatibilityReport } from './compatibility.types';
import type { VanillaAssetProvider } from '../vanilla-asset-provider';

export function evaluateCompatibility(provider: VanillaAssetProvider): CompatibilityReport {
  const catalog = new BlockCatalog();
  catalog.load(provider.catalog());
  const resolver = new BlockModelResolver(provider);
  const groups: Record<CompatibilityClassification, CompatibilityEntry[]> = { 'compatible-reused': [], 'changed-needs-delta': [], 'new-generic-supported': [], unsupported: [] };
  for (const definition of catalog.all()) {
    const entry = evaluateDefinition(provider, definition, resolver);
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

function evaluateDefinition(provider: VanillaAssetProvider, definition: BlockDefinition, resolver: BlockModelResolver): CompatibilityEntry {
  const resolved = resolver.resolve(definition.id, definition.defaultState, 'compatibility');
  const common = provider.minecraftVersion === '1.21.1' ? undefined : evaluateCommonBehavior({ ...definition, resources: definition.resources }, provider);
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
  } satisfies Omit<CompatibilityEntry, 'classification'>;
  if (common?.reason) return { ...base, classification: 'changed-needs-delta', reasonCode: 'STATE_CONTRACT_CHANGED', message: common.reason, actualProperties: definition.stateDefinitions.map((entry) => entry.name) };
  if (common?.compatible || definition.defaultStateSource === 'compatible-common') return { ...base, classification: 'compatible-reused', message: 'Common behavior contract matched the target resource state.' };
  if (provider.minecraftVersion === '1.21.1' && (definition.defaultStateSource === 'authoritative-report' || definition.defaultStateSource === 'verified-fixture' || definition.behaviorSupport !== 'unknown') && resolved.parts.length && !hasBlockingDiagnostic(resolved.diagnostics)) return { ...base, classification: 'compatible-reused', message: 'Verified 1.21.1 behavior and resource evidence were reused.' };
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
