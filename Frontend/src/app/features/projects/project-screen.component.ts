import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IndexedDbProjectStore } from '../../core/persistence/indexeddb-project-store';
import { ProjectPersistenceService } from '../../core/persistence/project-persistence.service';
import { ProjectSummary } from '../../core/persistence/project-store.port';
import { ProjectDocument } from '../../core/domain/project.types';
import { I18nService } from '../../core/ui/i18n.service';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';

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
  protected readonly name = signal('Untitled structure');
  protected readonly sizeX = signal(16);
  protected readonly sizeY = signal(16);
  protected readonly sizeZ = signal(16);
  protected readonly projects = signal<readonly ProjectSummary[]>([]);
  protected readonly error = signal<string | undefined>(undefined);
  private persistence?: ProjectPersistenceService;

  constructor() {
    void this.loadProjects();
  }

  protected updateName(value: string): void { this.name.set(value); }
  protected updateSize(axis: 'x' | 'y' | 'z', value: string): void {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return;
    ({ x: () => this.sizeX.set(parsed), y: () => this.sizeY.set(parsed), z: () => this.sizeZ.set(parsed) }[axis])();
  }

  protected async createProject(): Promise<void> {
    const now = new Date().toISOString();
    const project: ProjectDocument = {
      schemaVersion: 1, id: createId(), metadata: { name: this.name().trim() || 'Untitled structure', minecraftVersion: '1.21.1', createdAt: now, updatedAt: now },
      size: { x: this.sizeX(), y: this.sizeY(), z: this.sizeZ() }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
    };
    try {
      await this.getPersistence().create(project);
      this.workspace.activate(project);
      await this.router.navigateByUrl('/editor');
    } catch { this.error.set(this.i18n.t('createError')); }
  }

  protected async openProject(id: string): Promise<void> {
    try {
      const project = await this.getPersistence().open(id);
      if (!project) throw new Error('Project not found');
      this.workspace.activate(project);
      await this.router.navigateByUrl('/editor');
    } catch { this.error.set(this.i18n.t('openError')); }
  }

  private async loadProjects(): Promise<void> {
    try { this.projects.set(await this.getPersistence().list()); } catch { this.projects.set([]); }
  }

  private getPersistence(): ProjectPersistenceService {
    return this.persistence ??= new ProjectPersistenceService(new IndexedDbProjectStore());
  }
}

function createId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `project-${Date.now()}`;
}
