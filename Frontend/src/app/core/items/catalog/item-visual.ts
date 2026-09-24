import { itemVisualTextureResources, resolveItemVisual } from '../../renderer/geometry/block-model-geometry';
import type { RenderableAssetResourceProvider } from '../../assets/content-source/content-source.types';
import { texturePath } from '../../assets/vanilla/vanilla-asset-provider';
import type { ItemVisualInfo, ItemVisualTrace } from './item-catalog';
import { itemIdentityEvidenceFromProvider } from '../../assets/vanilla/format/item-evidence';

/** Resolves the same static item visual contract used by the world frame renderer.
 * It deliberately reports unsupported runtime selectors instead of guessing a texture. */
export function resolveCatalogItemVisual(provider: RenderableAssetResourceProvider, itemId: string): ItemVisualInfo {
  const resolved = resolveItemVisual(provider, itemId);
  const trace = (status: ItemVisualInfo['status'], resources: readonly string[], fallbackReason?: string): ItemVisualTrace => ({
    itemId,
    identityEvidence: itemIdentityEvidenceFromProvider(provider, itemId),
    entryPoint: resolved.model,
    modelChain: resolved.modelChain ?? (resolved.model ? [resolved.model] : []),
    adapter: resolved.kind === 'generated-layers' ? 'generated-layers' : resolved.kind === 'block-model' ? 'static-model' : 'runtime-unsupported',
    textures: resources,
    previewStatus: status,
    ...(fallbackReason ? { fallbackReason } : {}),
  });
  if (resolved.kind === 'unsupported') return { status: 'unsupported', kind: resolved.kind, resourcePaths: [], previewUrls: [], diagnostics: resolved.diagnostics, trace: trace('unsupported', [], resolved.diagnostics[0]) };
  const resources = itemVisualTextureResources(provider, itemId);
  if (!resources.length && resolved.kind === 'block-model' && !resolved.elements?.length) {
    const diagnostics = [...resolved.diagnostics, 'static item model has no texture resources'];
    return { status: 'missing-resource', kind: resolved.kind, resourcePaths: [], previewUrls: [], diagnostics, trace: trace('missing-resource', [], diagnostics.at(-1)) };
  }
  const missing = resources.filter((resource) => !provider.readBinary(texturePath(resource)));
  const previewUrls = resources.flatMap((resource) => { const url = provider.textureUrl(resource); return url ? [url] : []; });
  const status = missing.length || (resources.length > 0 && previewUrls.length !== resources.length) ? 'missing-resource' : 'available';
  const diagnostics = missing.length ? missing.map((resource) => `missing texture: ${resource}`) : resolved.diagnostics;
  return { status, kind: resolved.kind, resourcePaths: resources, previewUrls, diagnostics, trace: trace(status, resources, diagnostics.find((diagnostic) => diagnostic.includes('missing')) ) };
}
