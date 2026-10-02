import { Injectable, inject, Injector } from '@angular/core';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { ItemCatalogService } from '../../items/catalog/item-catalog.service';
import { PaintingVariantCatalogService } from '../../decorations/catalog/painting-variant-catalog.service';
import { VanillaAssetsService } from '../../assets/vanilla/vanilla-assets.service';
import type { ProjectDocument } from '../../domain/project.types';
import type { ExternalAiModContext, ExternalAiPromptContext } from './external-ai-prompt-builder';

@Injectable({ providedIn: 'root' })
export class ExternalAiPromptContextService {
  private readonly injector = inject(Injector);

  snapshot(project: ProjectDocument): ExternalAiPromptContext {
    const library = this.injector.get(BlockLibraryService);
    const itemsCatalog = this.injector.get(ItemCatalogService);
    const paintingsCatalog = this.injector.get(PaintingVariantCatalogService);
    const assets = this.injector.get(VanillaAssetsService);
    const externalSourceIds = new Set(assets.sources.sources().filter((source) => source.kind === 'external').map((source) => source.id));
    const blocks = library.allDefinitions().filter((entry) => externalSourceIds.has(entry.sourceId ?? '')).map((entry) => entry.id);
    const externalItems = itemsCatalog.all().filter((entry) => externalSourceIds.has(entry.sourceId ?? ''));
    const items = externalItems.map((entry) => entry.id);
    const itemMaxStackSizes = Object.fromEntries(externalItems.filter((entry) => entry.maxStackSize !== undefined).map((entry) => [entry.id, entry.maxStackSize!]));
    const paintings = paintingsCatalog.placeable().filter((entry) => externalSourceIds.has(entry.sourceId ?? '')).map((entry) => entry.id.includes(':') ? entry.id : `${entry.sourceId?.split(':')[1] ?? 'minecraft'}:${entry.id}`);
    const mods: ExternalAiModContext[] = assets.importedMods().map((mod) => ({
      id: mod.modId,
      name: mod.displayName,
      version: mod.version,
      loader: mod.report.normalizedMetadata?.loader ?? mod.report.loader,
      namespaces: mod.namespaces,
    }));
    return {
      minecraftVersion: project.metadata.minecraftVersion || assets.activeVersion(),
      vanillaSource: assets.sourceName() || 'local Minecraft Java assets',
      projectBounds: project.size,
      mods,
      blockIds: blocks,
      itemIds: items,
      itemMaxStackSizes,
      paintingIds: paintings,
    };
  }
}
