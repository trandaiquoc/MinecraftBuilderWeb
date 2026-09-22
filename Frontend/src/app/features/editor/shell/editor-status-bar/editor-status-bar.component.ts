import { Component, computed, inject } from '@angular/core';
import { EditorModeService } from '../../../../core/editor/state/editor-mode.service';
import { EditorToolService } from '../../../../core/editor/state/tool.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { ProjectAutosaveService } from '../../../../core/persistence/autosave/project-autosave.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { deriveAssetBootstrapStatus, VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';

@Component({ selector: 'app-editor-status-bar', templateUrl: './editor-status-bar.component.html', styleUrl: './editor-status-bar.component.scss' })
export class EditorStatusBarComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly mode = inject(EditorModeService);
  protected readonly tool = inject(EditorToolService);
  protected readonly selection = inject(SelectionService);
  protected readonly autosave = inject(ProjectAutosaveService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly assets = inject(VanillaAssetsService);
  protected readonly selectionCount = computed(() => { const box = this.selection.box(); return box ? (box.max.x - box.min.x + 1) * (box.max.y - box.min.y + 1) * (box.max.z - box.min.z + 1) : this.selection.logicalPositions().length; });
  protected saveStatusLabel(): string { return this.i18n.t(this.autosave.status() === 'pending' || this.autosave.status() === 'saving' ? 'savingProject' : this.autosave.status() === 'error' ? 'saveProjectError' : 'projectSaved'); }
  protected selectionSummaryLabel(): string { return this.i18n.t('selectionSummary').replace('{count}', String(this.selectionCount())); }
  protected assetStatus(): ReturnType<typeof deriveAssetBootstrapStatus> { return deriveAssetBootstrapStatus(this.assets.status(), this.assets.contentRestore(), this.assets.downloadProgress()); }
  protected assetStatusLabel(): string {
    const status = this.assetStatus();
    if (status.kind === 'loading-cache') return this.i18n.t('checkingAssetCache');
    if (status.kind === 'downloading') return `${this.i18n.t('downloadingAsset')}${status.percent === undefined ? '' : ` ${status.percent}%`}`;
    if (status.kind === 'preparing') return this.i18n.t('preparingAssets');
    if (status.kind === 'restoring-mods') { const label = this.i18n.t('restoringModsProgress').replace('{current}', String(status.current ?? 0)).replace('{total}', String(status.total ?? 0)); return status.sourceName ? `${label} · ${status.sourceName}` : label; }
    if (status.kind === 'partial') return this.i18n.t('assetsReadyWarnings').replace('{count}', String(status.warnings ?? 0));
    if (status.kind === 'unavailable') return this.i18n.t('assetsUnavailableForBrowser');
    return this.i18n.t('assetsReady');
  }
}
