import { Injectable, inject, Injector } from '@angular/core';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { ItemCatalogService } from '../../items/catalog/item-catalog.service';
import { PaintingVariantCatalogService } from '../../decorations/catalog/painting-variant-catalog.service';
import { ContentAssetRuntimeService } from '../../assets/content-asset-runtime.service';
import {
  HUGE_STRUCTURE_BLOCKS_MAX_AXIS,
  VANILLA_STRUCTURE_BLOCK_MAX_AXIS,
} from '../../domain/structure-size-policy';
import type { ProjectDocument } from '../../domain/project.types';
import type {
  ExternalAiDecorationContext,
  ExternalAiItemContext,
  ExternalAiModContext,
  ExternalAiPromptContext,
} from './external-ai-prompt-builder';

@Injectable({ providedIn: 'root' })
export class ExternalAiPromptContextService {
  private readonly injector = inject(Injector);

  snapshot(project: ProjectDocument): ExternalAiPromptContext {
    const library = this.injector.get(BlockLibraryService);
    const itemsCatalog = this.injector.get(ItemCatalogService);
    const paintingsCatalog = this.injector.get(PaintingVariantCatalogService);
    const assets = this.injector.get(ContentAssetRuntimeService);
    const externalSourceIds = new Set(assets.importedMods().map((mod) => mod.sourceId));
    const blocksBySource = new Map<string, string[]>();
    for (const entry of library.allDefinitions()) {
      if (!externalSourceIds.has(entry.sourceId)) continue;
      const bucket = blocksBySource.get(entry.sourceId) ?? [];
      bucket.push(entry.id);
      blocksBySource.set(entry.sourceId, bucket);
    }
    const itemsBySource = new Map<string, ExternalAiItemContext[]>();
    for (const entry of itemsCatalog.all()) {
      if (!externalSourceIds.has(entry.sourceId)) continue;
      const bucket = itemsBySource.get(entry.sourceId) ?? [];
      bucket.push({
        id: entry.id,
        ...(entry.maxStackSize === undefined ? {} : { maxStackSize: entry.maxStackSize }),
      });
      itemsBySource.set(entry.sourceId, bucket);
    }
    const decorationsBySource = new Map<string, ExternalAiDecorationContext[]>();
    for (const entry of paintingsCatalog.placeable()) {
      const sourceId = entry.sourceId ?? 'vanilla';
      if (!externalSourceIds.has(sourceId)) continue;
      const bucket = decorationsBySource.get(sourceId) ?? [];
      bucket.push({
        id: entry.id.includes(':')
          ? entry.id
          : `${entry.sourceId?.split(':')[1] ?? 'minecraft'}:${entry.id}`,
        kind: 'painting',
      });
      decorationsBySource.set(sourceId, bucket);
    }
    const mods: ExternalAiModContext[] = assets.importedMods().map((mod) => ({
      sourceId: mod.sourceId,
      id: mod.modId,
      name: mod.displayName,
      version: mod.version,
      loader: mod.report.normalizedMetadata?.loader ?? mod.report.loader,
      namespaces: mod.namespaces,
      blocks: blocksBySource.get(mod.sourceId) ?? [],
      items: itemsBySource.get(mod.sourceId) ?? [],
      decorations: decorationsBySource.get(mod.sourceId) ?? [],
    }));
    return {
      minecraftVersion: project.metadata.minecraftVersion || assets.activeVersion(),
      vanillaSource: assets.sourceName() || 'local Minecraft Java assets',
      projectContext: {
        currentSize: project.size,
        resizeSupported: true,
        maximumSize: {
          x: HUGE_STRUCTURE_BLOCKS_MAX_AXIS,
          y: HUGE_STRUCTURE_BLOCKS_MAX_AXIS,
          z: HUGE_STRUCTURE_BLOCKS_MAX_AXIS,
        },
        vanillaStructureBlockLimit: VANILLA_STRUCTURE_BLOCK_MAX_AXIS,
      },
      mods,
    };
  }
}
