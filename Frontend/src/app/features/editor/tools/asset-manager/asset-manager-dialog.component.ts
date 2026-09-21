import { Component, inject, output, signal } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import { trapDialogFocus } from '../../../../shared/ui/dialog/dialog-focus';

@Component({ selector: 'app-asset-manager-dialog', imports: [LucideX, UiTooltipDirective], templateUrl: './asset-manager-dialog.component.html', styleUrl: './asset-manager-dialog.component.scss', host: { '(document:keydown.escape)': 'closed.emit()' } })
export class AssetManagerDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly dialog = inject(DialogService);
  readonly closed = output<void>();
  protected readonly importing = signal(false);
  protected readonly removing = signal<string | undefined>(undefined);
  protected readonly modError = signal('');
  protected trapFocus(event: KeyboardEvent): void { trapDialogFocus(event, event.currentTarget as HTMLElement); }

  protected openJarPicker(input: HTMLInputElement): void {
    if (this.importing() || this.assets.status() === 'importing') return;
    input.value = '';
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === 'function') {
      try { picker.showPicker(); return; } catch { /* Fall back to the native click API. */ }
    }
    input.click();
  }

  protected async importJar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const confirmed = await this.dialog.confirm({
      title: this.i18n.t('assetManagerManualImportConfirmTitle'),
      text: this.i18n.t('assetManagerManualImportConfirmText').replace('{version}', this.assets.activeVersion()),
      confirmButtonText: this.i18n.t('assetManagerImport'),
      cancelButtonText: this.i18n.t('cancel'),
    });
    if (!confirmed) { input.value = ''; return; }
    this.importing.set(true);
    try { await this.assets.importJar(file); } finally { this.importing.set(false); input.value = ''; }
  }
  protected async importMod(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing.set(true); this.modError.set('');
    try { await this.assets.importModJar(file); }
    catch (error) { this.modError.set(error instanceof Error ? error.message : this.i18n.t('assetManagerImportError')); }
    finally { this.importing.set(false); input.value = ''; }
  }
  protected async removeMod(sourceId: string): Promise<void> {
    if (this.removing()) return;
    this.removing.set(sourceId);
    try { await this.assets.removeMod(sourceId); } finally { this.removing.set(undefined); }
  }
  protected async redownload(): Promise<void> { if (!this.importing()) { this.importing.set(true); try { await this.assets.redownload(); } finally { this.importing.set(false); } } }
  protected async removeCached(): Promise<void> { if (!this.importing()) { this.importing.set(true); try { await this.assets.removeCachedVersion(); } finally { this.importing.set(false); } } }
  protected statusLabel(): string {
    const status = this.assets.status();
    return status === 'ready' ? this.i18n.t('assetsReady') : status === 'importing' || status === 'downloading' || status === 'loading-cache' ? this.i18n.t('loadingAssets') : status === 'offline' ? this.i18n.t('assetsOffline') : status === 'no-assets' ? this.i18n.t('noAssets') : this.i18n.t('importRequired');
  }
}
