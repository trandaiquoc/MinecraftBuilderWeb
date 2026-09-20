import { Component, inject, output, signal } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { I18nService } from '../../core/ui/i18n.service';
import { UiTooltipDirective } from '../../shared/ui-tooltip.directive';
import { trapDialogFocus } from '../../shared/dialog-focus';

@Component({ selector: 'app-asset-manager-dialog', imports: [LucideX, UiTooltipDirective], templateUrl: './asset-manager-dialog.component.html', styleUrl: './asset-manager-dialog.component.scss', host: { '(document:keydown.escape)': 'closed.emit()' } })
export class AssetManagerDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly assets = inject(VanillaAssetsService);
  readonly closed = output<void>();
  protected readonly importing = signal(false);
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
    this.importing.set(true);
    try { await this.assets.importJar(file); } finally { this.importing.set(false); input.value = ''; }
  }
  protected statusLabel(): string {
    const status = this.assets.status();
    return status === 'ready' ? this.i18n.t('assetsReady') : status === 'importing' ? this.i18n.t('loadingAssets') : status === 'no-assets' ? this.i18n.t('noAssets') : this.i18n.t('importRequired');
  }
}
