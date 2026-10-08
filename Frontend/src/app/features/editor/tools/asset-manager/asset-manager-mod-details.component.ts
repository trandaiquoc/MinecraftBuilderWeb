import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { LucideCheckCircle2, LucideCircleX } from '@lucide/angular';
import type { ImportedModSummary } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { ModSupportCatalog } from '../../../../core/assets/mod/mod-support-catalog';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import { normalizeItemSearch } from '../../../../core/items/catalog/item-catalog';
import { ItemVisualService, ItemVisualState } from '../../../../core/items/catalog/item-visual.service';
import { compactContentCount, diagnosticPresentation } from './asset-manager-mod-presentation';

@Component({
  selector: 'app-asset-manager-mod-details',
  imports: [LucideCheckCircle2, LucideCircleX],
  templateUrl: './asset-manager-mod-details.component.html',
  styleUrl: './asset-manager-mod-details.component.scss',
})
export class AssetManagerModDetailsComponent {
  readonly mod = input.required<ImportedModSummary>();
  protected readonly i18n = inject(I18nService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly supportCatalog = inject(ModSupportCatalog);
  private readonly itemCatalog = inject(ItemCatalogService);
  private readonly itemVisuals = inject(ItemVisualService);
  private readonly requestedItemVisuals = new Set<string>();
  protected readonly itemSearch = signal('');
  private readonly sourceItems = computed(() => {
    const mod = this.mod();
    this.itemCatalog.generation();
    return this.itemCatalog.all().filter((entry) => entry.sourceId === mod.sourceId);
  });
  protected readonly items = computed(() => {
    const query = normalizeItemSearch(this.itemSearch());
    return this.sourceItems()
      .filter((entry) => !query || normalizeItemSearch(`${entry.displayName} ${entry.id} ${entry.namespace} ${entry.sourceName}`).includes(query))
      .slice(0, 100);
  });

  constructor() {
    effect(() => {
      const items = this.items();
      this.itemVisuals.revision();
      for (const item of items) {
        const state = this.itemVisuals.state(item.id);
        if (!this.requestedItemVisuals.has(item.id) || state.status === 'idle') {
          this.requestedItemVisuals.add(item.id);
          void this.itemVisuals.request(item.id).catch(() => undefined);
        }
      }
    });
  }

  protected setItemSearch(event: Event): void { this.itemSearch.set((event.target as HTMLInputElement).value); }
  protected itemVisualState(entry: { readonly id: string }): ItemVisualState { this.itemVisuals.revision(); return this.itemVisuals.state(entry.id); }
  protected itemVisualStatus(entry: { readonly id: string }): string {
    const status = this.itemVisualState(entry).status;
    return status === 'available' ? this.i18n.t('itemVisualRenderable') : status === 'missing-resource' ? this.i18n.t('itemVisualMissing') : status === 'loading' || status === 'queued' ? this.i18n.t('itemVisualLoading') : status === 'unsupported' ? this.i18n.t('itemVisualUnsupported') : this.i18n.t('itemVisualWaiting');
  }
  protected itemVisualPreviewUrls(entry: { readonly id: string }): readonly string[] { return this.itemVisualState(entry).info?.previewUrls ?? []; }
  protected itemVisualSummary(): string { return `${this.i18n.t('assetManagerIndexed')}: ${this.sourceItems().length}`; }
  protected loaderLabel(loader: ImportedModSummary['report']['loader']): string { return loader === 'unknown' ? this.i18n.t('assetManagerUnknownLoader') : loader[0].toUpperCase() + loader.slice(1); }
  protected compatibilityStatus(status: string | undefined): string { return status === 'compatible' ? this.i18n.t('assetManagerCompatible') : status === 'incompatible' ? this.i18n.t('assetManagerIncompatible') : this.i18n.t('assetManagerCannotVerify'); }
  protected isCertified(): boolean {
    const mod = this.mod();
    const metadata = mod.report.normalizedMetadata;
    return !!metadata && !!this.supportCatalog.certificationFor({ metadata, minecraftVersion: this.assets.activeVersion(), fingerprint: mod.fingerprint });
  }
  protected compactCount(imported: number, detected: number): string { return compactContentCount(imported, detected, ''); }
  protected hasDiagnostics(kind: 'blocking' | 'warning' | 'info'): boolean { return this.mod().report.diagnostics.some((diagnostic) => diagnostic.category === kind || (kind === 'warning' && diagnostic.severity === 'warning') || (kind === 'info' && diagnostic.severity === 'info')); }
  protected diagnosticCount(kind: 'blocking' | 'warning' | 'info'): number {
    return this.mod().report.diagnostics.filter((diagnostic) => diagnostic.category === kind || (kind === 'warning' && diagnostic.severity === 'warning') || (kind === 'blocking' && (diagnostic.severity === 'error' || diagnostic.category === 'blocking')) || (kind === 'info' && diagnostic.severity === 'info')).length;
  }
  protected hasProminentDiagnostics(): boolean { return diagnosticPresentation(this.mod().report) === 'prominent'; }
}
