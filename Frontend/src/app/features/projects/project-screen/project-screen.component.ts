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

@Component({
  selector: 'app-project-screen',
  imports: [DatePipe],
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

function createId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `project-${Date.now()}`;
}
