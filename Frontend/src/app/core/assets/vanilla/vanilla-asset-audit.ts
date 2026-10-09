import * as THREE from 'three';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { BlockModelResolver } from '../../blocks/resolver';
import { VanillaBlockVisualProvider } from '../../renderer/geometry/vanilla-block-visual-provider';
import { VanillaAssetProvider } from './vanilla-asset-provider';
import {
  auditVanillaAssetEntry,
  decodePng,
  classifyVisualSupport,
} from './vanilla-asset-entry-audit';
import { buildVanillaAssetCoverage } from './vanilla-asset-coverage';
import type {
  VanillaAssetAuditOptions,
  VanillaAssetCoverageReport,
  VanillaAssetAuditRecord,
} from './vanilla-asset-audit.types';

export type {
  AssetAuditReason,
  VanillaAssetAuditRecord,
  VanillaAssetCoverageReport,
  VanillaAssetAuditOptions,
} from './vanilla-asset-audit.types';
export { classifyVisualSupport } from './vanilla-asset-entry-audit';

/** Coordinates bounded audit batches and owns the temporary visual provider lifetime. */
export async function auditVanillaAssets(
  provider: VanillaAssetProvider,
  options: VanillaAssetAuditOptions = {},
): Promise<VanillaAssetCoverageReport> {
  const catalog = new BlockCatalog();
  catalog.load(provider.catalog(options.registry));
  const definitions = catalog.all();
  const resolver = new BlockModelResolver(provider);
  const visualProvider = new VanillaBlockVisualProvider(provider, async () => new THREE.Texture());
  const decodeCache = new Map<string, Promise<boolean>>();
  const records: VanillaAssetAuditRecord[] = [];
  const batchSize = Math.max(1, Math.trunc(options.batchSize ?? 16));

  try {
    for (let offset = 0; offset < definitions.length; offset += batchSize) {
      if (options.signal?.aborted)
        throw new DOMException('Vanilla asset audit was cancelled', 'AbortError');
      const batch = definitions.slice(offset, offset + batchSize);
      const work = batch.map((definition) =>
        auditVanillaAssetEntry(
          definition,
          provider,
          resolver,
          visualProvider,
          decodeCache,
          options.decodeTexture ?? decodePng,
        ),
      );
      try {
        records.push(...(await Promise.all(work)));
      } catch (error) {
        await Promise.allSettled(work);
        throw error;
      }
      options.onProgress?.(Math.min(offset + batch.length, definitions.length), definitions.length);
      await Promise.resolve();
    }
  } finally {
    visualProvider.dispose();
  }

  return buildVanillaAssetCoverage(provider, records);
}

export { buildVanillaAssetCoverage } from './vanilla-asset-coverage';
