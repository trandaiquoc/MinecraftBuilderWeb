import { Component, inject, input, output, signal, computed } from '@angular/core';
import { GroupService } from '../../../../core/editor/groups/group.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { filterGroups } from '../../../../core/editor/groups/group-search';
import { LucideCheck, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';

@Component({ selector: 'app-groups-panel', imports: [LucideCheck, LucideX, UiTooltipDirective], templateUrl: './groups-panel.component.html', styleUrl: './groups-panel.component.scss' })
export class GroupsPanelComponent {
  protected readonly groups = inject(GroupService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly selection = inject(SelectionService);
  protected readonly i18n = inject(I18nService);
  private readonly dialogs = inject(DialogService);
  readonly movePanelVisible = input(false);
  readonly movePanelToggle = output<void>();
  protected readonly newGroupName = signal('');
  protected readonly groupSearch = signal('');
  protected readonly filteredGroups = computed(() => filterGroups(this.workspace.project()?.groups ?? [], this.groupSearch(), { locked: this.i18n.t('locked'), unlocked: this.i18n.t('unlocked') }));
  protected readonly hasSelection = computed(() => { const service = this.selection as SelectionService & { hasAny?: (project?: import('../../../../core/domain/project.types').ProjectDocument) => boolean }; return service.hasAny ? service.hasAny(this.workspace.project()) : this.selection.logicalPositions().length > 0 || !!this.selection.single() || !!this.selection.box(); });
  protected createGroup(): void { if (this.groups.create(this.newGroupName().trim())) this.newGroupName.set(''); }
  protected clearGroupSearch(): void { this.groupSearch.set(''); }
  protected renameGroup(event: Event): void { this.groups.renameActive((event.target as HTMLInputElement).value); }
  protected async deleteGroupBlocks(): Promise<void> {
    const group = this.groups.activeGroup();
    if (!group || group.locked) return;
    const count = this.groups.activeGroupBlockCount();
    if (!count) return;
    const confirmed = await this.dialogs.confirm({ title: this.i18n.t('deleteGroupBlocksTitle'), text: this.i18n.t('deleteGroupBlocksConfirmation').replace('{count}', String(count)).replace('{name}', group.name), confirmButtonText: this.i18n.t('deleteGroupBlocksConfirm'), cancelButtonText: this.i18n.t('cancel') });
    if (confirmed) this.groups.deleteActiveBlocks();
  }
}
