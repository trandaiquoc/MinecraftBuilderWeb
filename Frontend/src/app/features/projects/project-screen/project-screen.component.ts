import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IndexedDbProjectStore } from '../../../core/persistence/project-store/indexeddb-project-store';
import { ProjectPersistenceService } from '../../../core/persistence/project-persistence.service';
import { ProjectSummary } from '../../../core/persistence/project-store/project-store.port';
import { ProjectDocument } from '../../../core/domain/project.types';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { EditorSessionService } from '../../../core/editor/state/editor-session.service';
import { ProjectAutosaveService } from '../../../core/persistence/autosave/project-autosave.service';
import { LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';

@Component({
  selector: 'app-project-screen',
  imports: [DatePipe, LucideX, UiTooltipDirective],
  templateUrl: './project-screen.component.html',
  styleUrl: './project-screen.component.scss',
})
export class ProjectScreenComponent {
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly dialogs = inject(DialogService);
  private readonly session = inject(EditorSessionService);
  protected readonly name = signal(this.i18n.t('untitledStructure'));
  protected readonly sizeX = signal('16');
  protected readonly sizeY = signal('16');
  protected readonly sizeZ = signal('16');
  protected readonly projects = signal<readonly ProjectSummary[]>([]);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly listError = signal(false);
  protected readonly loadStatus = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly creating = signal(false);
  protected readonly openingId = signal<string | undefined>(undefined);
  protected readonly deletingProjectIds = signal<ReadonlySet<string>>(new Set());
  protected readonly deleteError = signal<string | undefined>(undefined);
  private readonly autosave = inject(ProjectAutosaveService);
  private persistence?: ProjectPersistenceService;

  constructor() {
    void this.loadProjects();
  }

  protected updateName(value: string): void { this.name.set(value); }
  protected updateSize(axis: 'x' | 'y' | 'z', value: string): void {
    ({ x: () => this.sizeX.set(value), y: () => this.sizeY.set(value), z: () => this.sizeZ.set(value) }[axis])();
    this.error.set(undefined);
  }

  protected async createProject(): Promise<void> {
    const guard = projectCreationGuard(this.creating(), !!this.openingId(), this.validDimensions());
    if (guard === 'busy') return;
    if (guard === 'invalid') { this.error.set(this.i18n.t('invalidProjectSize')); return; }
    this.creating.set(true); this.error.set(undefined);
    const now = new Date().toISOString();
    const project: ProjectDocument = {
      schemaVersion: 3, id: createId(), metadata: { name: this.name().trim() || this.i18n.t('untitledStructure'), minecraftVersion: '1.21.1', createdAt: now, updatedAt: now },
      size: { x: Number(this.sizeX()), y: Number(this.sizeY()), z: Number(this.sizeZ()) }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], decorations: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
    };
    try {
      await this.getPersistence().create(project);
      this.session.resetForProjectChange(project.id);
      this.workspace.activate(project);
      await this.router.navigateByUrl('/editor');
    } catch { this.error.set(this.i18n.t('createError')); await this.dialogs.error(this.i18n.t('createErrorTitle'), this.i18n.t('createError')); }
    finally { this.creating.set(false); }
  }

  protected async openProject(id: string): Promise<void> {
    if (this.creating() || this.openingId()) return;
    this.openingId.set(id); this.error.set(undefined);
    try {
      const project = await this.getPersistence().open(id);
      if (!project) throw new Error('Project not found');
      this.session.resetForProjectChange(project.id);
      this.workspace.activate(project);
      await this.router.navigateByUrl('/editor');
    } catch { this.error.set(this.i18n.t('openError')); await this.dialogs.error(this.i18n.t('openErrorTitle'), this.i18n.t('openError')); }
    finally { this.openingId.set(undefined); }
  }

  protected async deleteProject(summary: ProjectSummary, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.creating() || this.openingId() || !canDeleteProject(this.deletingProjectIds(), summary.id)) return;
    this.deletingProjectIds.update((ids) => new Set(ids).add(summary.id));
    this.deleteError.set(undefined);
    const isCurrentProject = this.workspace.project()?.id === summary.id;
    const isRememberedProject = this.workspace.isRememberedProject(summary.id);
    try {
      const confirmed = await this.dialogs.confirm({
        title: this.i18n.t('deleteProjectTitle'),
        text: this.i18n.t('deleteProjectText').replace('{name}', summary.name),
        confirmButtonText: this.i18n.t('deleteProjectConfirm'),
        cancelButtonText: this.i18n.t('cancel'),
        icon: 'warning',
        destructive: true,
      });
      if (!confirmed) return;

      if (isCurrentProject) await this.autosave.deleteProject(summary.id);
      else await this.getPersistence().delete(summary.id);
      this.projects.update((items) => items.filter((item) => item.id !== summary.id));
      if (isCurrentProject) {
        this.session.clearActiveProject();
        this.workspace.deactivate();
      } else if (isRememberedProject) {
        this.workspace.clearRememberedProject(summary.id);
      }
    } catch {
      this.deleteError.set(this.i18n.t('deleteProjectError'));
    } finally {
      this.deletingProjectIds.update((ids) => { const next = new Set(ids); next.delete(summary.id); return next; });
    }
  }

  protected async retryLoad(): Promise<void> { await this.loadProjects(); }
  protected validDimensions(): boolean { return [this.sizeX(), this.sizeY(), this.sizeZ()].every((value) => /^\d+$/.test(value.trim()) && Number(value) >= 1); }

  private async loadProjects(): Promise<void> {
    this.loadStatus.set('loading'); this.listError.set(false);
    try { this.projects.set(await this.getPersistence().list()); this.loadStatus.set('ready'); }
    catch { this.projects.set([]); this.listError.set(true); this.loadStatus.set('error'); }
  }

  private getPersistence(): ProjectPersistenceService {
    return this.persistence ??= new ProjectPersistenceService(new IndexedDbProjectStore());
  }
}

export function projectCreationGuard(creating: boolean, opening: boolean, dimensionsValid: boolean): 'busy' | 'invalid' | undefined {
  if (creating || opening) return 'busy';
  return dimensionsValid ? undefined : 'invalid';
}

export function canDeleteProject(deletingProjectIds: ReadonlySet<string>, projectId: string): boolean {
  return !deletingProjectIds.has(projectId);
}

function createId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `project-${Date.now()}`;
}
