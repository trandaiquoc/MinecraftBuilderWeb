import { Component, computed, inject } from '@angular/core';
import { EditorModeService } from '../../../core/editor/editor-mode.service';
import { EditorToolService } from '../../../core/editor/tool.service';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { ProjectAutosaveService } from '../../../core/persistence/project-autosave.service';
import { WorkspaceStateService } from '../../../core/ui/workspace-state.service';
import { I18nService } from '../../../core/ui/i18n.service';

@Component({ selector: 'app-editor-status-bar', templateUrl: './editor-status-bar.component.html', styleUrl: './editor-status-bar.component.scss' })
export class EditorStatusBarComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly mode = inject(EditorModeService);
  protected readonly tool = inject(EditorToolService);
  protected readonly selection = inject(SelectionService);
  protected readonly autosave = inject(ProjectAutosaveService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly selectionCount = computed(() => { const box = this.selection.box(); return box ? (box.max.x - box.min.x + 1) * (box.max.y - box.min.y + 1) * (box.max.z - box.min.z + 1) : this.selection.logicalPositions().length; });
  protected saveStatusLabel(): string { return this.i18n.t(this.autosave.status() === 'pending' || this.autosave.status() === 'saving' ? 'savingProject' : this.autosave.status() === 'error' ? 'saveProjectError' : 'projectSaved'); }
  protected selectionSummaryLabel(): string { return this.i18n.t('selectionSummary').replace('{count}', String(this.selectionCount())); }
}
