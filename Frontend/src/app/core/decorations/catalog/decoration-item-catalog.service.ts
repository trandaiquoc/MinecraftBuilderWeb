import { Injectable, effect, inject, signal } from '@angular/core';
import { VanillaAssetsService } from '../../assets/vanilla/vanilla-assets.service';
import { DecorationItemCatalog, DecorationItemDefinition } from './decoration-item-catalog';
import { loadVanillaItemRegistry, VanillaItemRegistry } from '../../items/registry/vanilla-item-registry';

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
    const version = (provider as { gameVersion?: string }).gameVersion;
    const registry: VanillaItemRegistry | undefined = version === '1.21.1' ? await this.registry : undefined;
    if (provider !== this.assets.provider()) return;
    this.catalog.load(provider, registry);
    this.generation.update((value) => value + 1);
  }
}
