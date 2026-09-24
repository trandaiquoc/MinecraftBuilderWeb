import { itemVisualTextureResources, resolveItemVisual } from '../../renderer/geometry/block-model-geometry';
import type { RenderableAssetResourceProvider } from '../../assets/content-source/content-source.types';
import { texturePath } from '../../assets/vanilla/vanilla-asset-provider';
import type { ItemVisualInfo } from './item-catalog';

/** Resolves the same static item visual contract used by the world frame renderer.
 * It deliberately reports unsupported runtime selectors instead of guessing a texture. */
export function resolveCatalogItemVisual(provider: RenderableAssetResourceProvider, itemId: string): ItemVisualInfo {
  const resolved = resolveItemVisual(provider, itemId);
  if (resolved.kind === 'unsupported') return { status: 'unsupported', kind: resolved.kind, resourcePaths: [], previewUrls: [], diagnostics: resolved.diagnostics };
  const resources = itemVisualTextureResources(provider, itemId);
  const missing = resources.filter((resource) => !provider.readBinary(texturePath(resource)));
  const previewUrls = resources.flatMap((resource) => { const url = provider.textureUrl(resource); return url ? [url] : []; });
  const status = missing.length || (resources.length > 0 && previewUrls.length !== resources.length) ? 'missing-resource' : 'available';
  return { status, kind: resolved.kind, resourcePaths: resources, previewUrls, diagnostics: missing.length ? missing.map((resource) => `missing texture: ${resource}`) : resolved.diagnostics };
}
