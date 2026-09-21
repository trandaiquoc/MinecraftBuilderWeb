import { Injectable, effect, inject, signal } from '@angular/core';
import { VanillaAssetsService } from '../../assets/vanilla/vanilla-assets.service';
import { DecorationItemCatalog, DecorationItemDefinition } from './decoration-item-catalog';
import { loadVanillaItemRegistry, VanillaItemRegistry } from '../../items/registry/vanilla-item-registry';
import { DEFAULT_MINECRAFT_VERSION } from '../../domain/project.types';

@Injectable({ providedIn: 'root' })
export class DecorationItemCatalogService {
  private readonly assets = inject(VanillaAssetsService);
  private readonly catalog = new DecorationItemCatalog();
  private readonly registry = loadVanillaItemRegistry().catch(() => undefined);
  readonly generation = signal(0);
  constructor() { effect(() => { const provider = this.assets.provider(); if (!provider) return; void this.load(provider); }); }
  search(query: string): readonly DecorationItemDefinition[] { this.generation(); return this.catalog.search(query); }
  all(): readonly DecorationItemDefinition[] { this.generation(); return this.catalog.all(); }
  private async load(provider: Parameters<DecorationItemCatalog['load']>[0]): Promise<void> {
    if ((provider as { gameVersion?: string }).gameVersion !== DEFAULT_MINECRAFT_VERSION) { this.catalog.clear(); this.generation.update((value) => value + 1); return; }
    const registry: VanillaItemRegistry | undefined = await this.registry;
    if (!registry || provider !== this.assets.provider()) return;
    this.catalog.load(provider, registry);
    this.generation.update((value) => value + 1);
  }
}
