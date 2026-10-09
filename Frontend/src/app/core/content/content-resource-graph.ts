import type { AssetResourceProvider, ResolvedBlockModel } from '../blocks/resolver/resolver.types';
import { resourcePath } from './resource-location';
import type { ContentIntrospectionDiagnostic, ContentIntrospectionDiagnosticCode } from './content-semantic-types';

export interface ResourceGraphNode {
  readonly id: string;
  readonly kind: 'blockstate' | 'model' | 'parent' | 'texture' | 'item' | 'decoration' | 'unknown';
  readonly sourceId: string;
  readonly sourceName: string;
}

export interface ResourceGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'variant' | 'model' | 'parent' | 'texture' | 'item' | 'decoration';
}

export interface ResourceDependencyGraph {
  readonly nodes: readonly ResourceGraphNode[];
  readonly edges: readonly ResourceGraphEdge[];
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
}

export function buildBlockResourceGraph(blockId: string, resources: readonly string[], model: ResolvedBlockModel, provider: AssetResourceProvider, source: { readonly id: string; readonly name: string }): ResourceDependencyGraph {
  const nodes = new Map<string, ResourceDependencyGraph['nodes'][number]>(); const edges: ResourceDependencyGraph['edges'][number][] = [];
  const add = (id: string, kind: ResourceDependencyGraph['nodes'][number]['kind']): void => { const owner = resourceOwner(provider, id); nodes.set(id, { id, kind, sourceId: owner.id, sourceName: owner.name }); };
  const blockstate = resourcePath(blockId, 'blockstates');
  if (blockstate) { add(blockstate, 'blockstate'); resources.forEach((resource) => { if (resource !== blockstate) edges.push({ from: blockstate, to: resource, kind: 'variant' }); }); }
  model.trace.modelResources.forEach((resource) => add(resource, 'model')); model.trace.parentResources.forEach((resource) => add(resource, 'parent')); model.trace.textureResources.forEach((resource) => add(resource, 'texture'));
  model.trace.modelResources.forEach((resource) => { if (blockstate) edges.push({ from: blockstate, to: resource, kind: 'model' }); });
  model.trace.parentResources.forEach((resource) => model.trace.modelResources.forEach((modelResource) => edges.push({ from: modelResource, to: resource, kind: 'parent' })));
  model.trace.textureResources.forEach((resource) => model.trace.modelResources.forEach((modelResource) => edges.push({ from: modelResource, to: resource, kind: 'texture' })));
  const diagnostics = model.diagnostics.map((diagnostic) => mapResolverDiagnostic(diagnostic.code, diagnostic.message, diagnostic.resource, source.id));
  for (const resource of resources) if (resource.endsWith('.json') && !provider.readJson(resource)) diagnostics.push({ code: 'missing-resource', message: `Missing resource: ${resource}`, resource, sourceId: source.id });
  return { nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)), edges: dedupeEdges(edges), diagnostics: uniqueDiagnostics(diagnostics) };
}

export function buildItemResourceGraph(itemId: string, resources: readonly string[], provider: AssetResourceProvider, source: { readonly id: string; readonly name: string }): ResourceDependencyGraph {
  const nodes = new Map<string, ResourceDependencyGraph['nodes'][number]>(); const edges: ResourceDependencyGraph['edges'][number][] = []; const itemNode = `item:${itemId}`;
  nodes.set(itemNode, { id: itemNode, kind: 'item', sourceId: source.id, sourceName: source.name });
  for (const reference of resources) {
    const modelResource = resourcePath(reference, 'models'); const textureResource = resourcePath(reference, 'textures');
    const resource = modelResource && provider.readJson(modelResource) ? modelResource : textureResource ?? reference;
    const kind: ResourceDependencyGraph['nodes'][number]['kind'] = resource === textureResource && resource !== modelResource ? 'texture' : 'model';
    const owner = resourceOwner(provider, resource); nodes.set(resource, { id: resource, kind, sourceId: owner.id, sourceName: owner.name }); edges.push({ from: itemNode, to: resource, kind: kind === 'texture' ? 'texture' : 'item' });
    if (resource.endsWith('.json') && !provider.readJson(resource)) edges.push({ from: itemNode, to: resource, kind: 'item' });
  }
  const diagnostics = [...edges.filter((edge) => edge.to.endsWith('.json') && !provider.readJson(edge.to)).map((edge) => ({ code: 'missing-resource' as const, message: `Missing resource: ${edge.to}`, resource: edge.to, sourceId: source.id }))];
  return { nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)), edges: dedupeEdges(edges), diagnostics };
}

export function resourceSourceMetadata(provider: AssetResourceProvider, fallbackId?: string, fallbackName?: string): { readonly id: string; readonly name: string } {
  const source = (provider as { readonly source?: { readonly id?: string; readonly displayName?: string } }).source;
  return { id: source?.id ?? fallbackId ?? 'unknown', name: source?.displayName ?? fallbackName ?? source?.id ?? fallbackId ?? 'Unknown' };
}
function resourceOwner(provider: AssetResourceProvider, resource: string): { readonly id: string; readonly name: string } {
  const routed = provider as AssetResourceProvider & { providerForExactPath?: (path: string) => readonly { readonly source?: { readonly id?: string; readonly displayName?: string } }[] };
  const owner = routed.providerForExactPath?.(resource)?.[0]?.source;
  return { id: owner?.id ?? resourceSourceMetadata(provider).id, name: owner?.displayName ?? resourceSourceMetadata(provider).name };
}
export function mapResolverDiagnostic(code: string, message: string, resource: string | undefined, sourceId: string): ContentIntrospectionDiagnostic { const mapped: ContentIntrospectionDiagnosticCode = code === 'missing-parent' || code === 'parent-cycle' ? (code === 'parent-cycle' ? 'resource-cycle' : 'missing-parent') : code === 'missing-texture' || code === 'texture-cycle' ? (code === 'texture-cycle' ? 'resource-cycle' : 'missing-texture') : code === 'missing-model' || code === 'missing-blockstate' ? 'missing-resource' : code === 'malformed-model' || code === 'malformed-blockstate' ? 'malformed-resource' : 'unsupported-resource'; return { code: mapped, message, resource, sourceId }; }
function dedupeEdges(edges: readonly ResourceDependencyGraph['edges'][number][]): readonly ResourceDependencyGraph['edges'][number][] { const seen = new Set<string>(); return edges.filter((edge) => { const key = `${edge.from}|${edge.to}|${edge.kind}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function uniqueDiagnostics(diagnostics: readonly ContentIntrospectionDiagnostic[]): readonly ContentIntrospectionDiagnostic[] { const seen = new Set<string>(); return diagnostics.filter((diagnostic) => { const key = `${diagnostic.code}|${diagnostic.resource}|${diagnostic.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
