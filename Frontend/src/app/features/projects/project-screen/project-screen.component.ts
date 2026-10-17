import { DatePipe, NgOptimizedImage } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, computed, inject, signal } from '@angular/core';
import { ProjectSummary } from '../../../core/persistence/project-store/project-store.port';
import {
  DEFAULT_MINECRAFT_VERSION,
  ProjectSize,
  StructureMode,
} from '../../../core/domain/project.types';
import {
  DEFAULT_STRUCTURE_MODE,
  effectiveStructureModeForSize,
  evaluateStructureSize,
  isStructureCreationAllowed,
} from '../../../core/domain/structure-size-policy';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import { ThemeService } from '../../../core/ui/theme/theme.service';
import { LucideFileUp, LucideHardDrive, LucideTrash2, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import {
  SearchableDropdownComponent,
  SearchableDropdownOption,
} from '../../../shared/ui/searchable-dropdown/searchable-dropdown.component';
import {
  MojangRelease,
  MojangVersionService,
} from '../../../core/assets/vanilla/mojang-vanilla-asset-source';
import { SettingsDialogComponent } from '../../editor/settings/settings-dialog/settings-dialog.component';
import type {
  StructureJsonProjectImportError,
  StructureJsonProjectImportPreview,
} from '../../../core/persistence/structure-json/import/structure-json-project-import';
import { StructureJsonProjectImportWorkflow } from './structure-json-project-import-workflow';
import { ProjectScreenWorkflow } from './project-screen-workflow';
import { ProjectScreenControlsComponent } from './project-screen-controls.component';

@Component({
  selector: 'app-project-screen',
  providers: [ProjectScreenWorkflow],
  imports: [
    CdkTrapFocus,
    DatePipe,
    NgOptimizedImage,
    LucideFileUp,
    LucideHardDrive,
    LucideTrash2,
    LucideX,
    UiTooltipDirective,
    SearchableDropdownComponent,
    ProjectScreenControlsComponent,
    SettingsDialogComponent,
  ],
  templateUrl: './project-screen.component.html',
  styleUrl: './project-screen.component.scss',
})
export class ProjectScreenComponent {
  protected readonly i18n = inject(I18nService);
  private readonly preferences = inject(UiPreferencesService);
  protected readonly theme = inject(ThemeService);
  protected readonly workflow = inject(ProjectScreenWorkflow);
  protected readonly sceneAsset = computed(
    () => `assets/project-screen/laundromat-${this.theme.theme()}.jpg`,
  );
  protected readonly selectedProjectId = signal<string | undefined>(undefined);
  protected readonly selectedProject = computed(() => {
    const projects = this.projects();
    return (
      projects.find((project) => project.id === this.selectedProjectId()) ?? projects[0] ?? null
    );
  });
  protected readonly createDialogOpen = signal(false);
  protected readonly name = signal(this.i18n.t('untitledStructure'));
  protected readonly defaultMinecraftVersion = DEFAULT_MINECRAFT_VERSION;
  protected readonly sizeX = signal('16');
  protected readonly sizeY = signal('16');
  protected readonly sizeZ = signal('16');
  protected readonly minecraftVersion = signal<string>(DEFAULT_MINECRAFT_VERSION);
  protected readonly structureMode = signal<StructureMode>(DEFAULT_STRUCTURE_MODE);
  private readonly enteredSize = computed<ProjectSize>(() => ({
    x: Number(this.sizeX()),
    y: Number(this.sizeY()),
    z: Number(this.sizeZ()),
  }));
  protected readonly effectiveStructureMode = computed(() =>
    effectiveStructureModeForSize(
      this.enteredSize(),
      this.structureMode(),
      this.preferences.preferences().autoUseHugeStructureBlocks,
    ),
  );
  protected readonly sizePolicy = computed(() =>
    evaluateStructureSize(this.enteredSize(), this.effectiveStructureMode()),
  );
  protected readonly versions = inject(MojangVersionService);
  protected readonly versionOptions = computed<readonly SearchableDropdownOption[]>(() => {
    const releases = this.versions.releases();
    const entries = releases.length
      ? releases
      : [
          {
            id: DEFAULT_MINECRAFT_VERSION,
            type: 'release' as const,
            url: '',
          } satisfies MojangRelease,
        ];
    return entries.map((release) => ({
      id: release.id,
      label: `Java ${release.id}`,
      secondary:
        release.id === DEFAULT_MINECRAFT_VERSION
          ? this.i18n.t('verifiedSupport')
          : this.i18n.t('resourceCompatibility'),
    }));
  });
  protected readonly projects = this.workflow.projects;
  protected readonly error = this.workflow.error;
  protected readonly listError = this.workflow.listError;
  protected readonly loadStatus = this.workflow.loadStatus;
  protected readonly creating = this.workflow.creating;
  protected readonly openingId = this.workflow.openingId;
  protected readonly deletingProjectIds = this.workflow.deletingProjectIds;
  protected readonly settingsDialogOpen = signal(false);
  protected readonly deleteError = this.workflow.deleteError;
  protected readonly structureJsonImport = new StructureJsonProjectImportWorkflow((project) =>
    this.workflow.createImportedProject(project),
  );

  constructor() {
    void this.workflow.loadProjects();
    void this.loadVersions();
  }

  protected updateName(value: string): void {
    this.name.set(value);
  }
  protected updateSize(axis: 'x' | 'y' | 'z', value: string): void {
    ({
      x: () => this.sizeX.set(value),
      y: () => this.sizeY.set(value),
      z: () => this.sizeZ.set(value),
    })[axis]();
    const nextSize = {
      x: Number(axis === 'x' ? value : this.sizeX()),
      y: Number(axis === 'y' ? value : this.sizeY()),
      z: Number(axis === 'z' ? value : this.sizeZ()),
    };
    if (evaluateStructureSize(nextSize).fitsVanilla) this.structureMode.set(DEFAULT_STRUCTURE_MODE);
    this.workflow.clearError();
  }
  protected setMinecraftVersion(value: string): void {
    if (value) this.minecraftVersion.set(value);
  }
  protected useHugeStructureBlocks(): void {
    if (this.sizePolicy().exceedsVanilla && this.sizePolicy().fitsHugeStructureBlocks)
      this.structureMode.set('huge-structure-blocks');
  }
  protected setVanillaMax(): void {
    this.sizeX.set('48');
    this.sizeY.set('48');
    this.sizeZ.set('48');
    this.structureMode.set(DEFAULT_STRUCTURE_MODE);
  }
  protected openSettingsDialog(): void {
    this.settingsDialogOpen.set(true);
  }
  protected closeSettingsDialog(): void {
    this.settingsDialogOpen.set(false);
  }
  protected openCreateDialog(): void {
    this.createDialogOpen.set(true);
  }
  protected closeCreateDialog(): void {
    if (!this.creating()) this.createDialogOpen.set(false);
  }
  protected selectProject(id: string): void {
    this.selectedProjectId.set(id);
  }
  protected openStructureJsonPicker(input: HTMLInputElement): void {
    if (!this.structureJsonImport.creating()) input.click();
  }
  protected async selectStructureJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.structureJsonImport.selectFile(file, this.i18n.t('untitledStructure'));
  }
  protected closeStructureJsonImport(): void {
    this.structureJsonImport.close();
  }
  protected async createProjectFromStructureJson(): Promise<void> {
    const project = await this.structureJsonImport.createProject();
    if (!project) return;
    await this.workflow.activateImportedProject(project);
  }
  protected structureJsonImportProgressLabel(): string {
    const progress = this.structureJsonImport.progress();
    if (progress === 'reading') return this.i18n.t('structureJsonProjectReading');
    if (progress === 'parsing') return this.i18n.t('structureJsonProjectParsing');
    if (progress === 'checking') return this.i18n.t('structureJsonProjectChecking');
    if (progress === 'saving') return this.i18n.t('structureJsonProjectSaving');
    return '';
  }
  protected structureJsonImportErrorMessage(): string {
    const failure = this.structureJsonImport.failure();
    if (!failure) return '';
    if (failure.kind === 'parse') return this.structureJsonValidationError(failure.code);
    if (failure.kind === 'prepare') return this.structureJsonProjectImportError(failure.code);
    return this.i18n.t(
      failure.kind === 'save' ? 'createStorageError' : 'structureJsonProjectFileReadError',
    );
  }
  protected structureJsonImportModeLabel(preview: StructureJsonProjectImportPreview): string {
    return this.i18n.t(
      preview.structureMode === 'huge-structure-blocks'
        ? 'hugeStructureBlocks'
        : 'vanillaStructureBlock',
    );
  }
  protected versionSupportLabel(): string {
    return this.minecraftVersion() === DEFAULT_MINECRAFT_VERSION
      ? this.i18n.t('verifiedSupport')
      : this.i18n.t('resourceCompatibility');
  }
  protected summaryModeFullLabel(mode: StructureMode): string {
    return this.i18n.t(
      mode === 'huge-structure-blocks' ? 'hugeStructureBlocks' : 'vanillaStructureBlock',
    );
  }
  protected summarySizeLabel(project: ProjectSummary): string {
    return `${project.size.x} × ${project.size.y} × ${project.size.z}`;
  }
  protected summarySizeBadgeAriaLabel(project: ProjectSummary): string {
    return this.i18n
      .t('recentProjectSizeBadgeAria')
      .replace('{mode}', this.summaryModeFullLabel(project.structureMode))
      .replace('{size}', this.summarySizeLabel(project));
  }

  protected async createProject(): Promise<void> {
    await this.workflow.createProject({
      name: this.name(),
      minecraftVersion: this.minecraftVersion(),
      size: this.enteredSize(),
      structureMode: this.effectiveStructureMode(),
    });
  }

  protected async openProject(id: string): Promise<void> {
    this.selectProject(id);
    await this.workflow.openProject(id);
  }

  protected async deleteProject(summary: ProjectSummary, event: Event): Promise<void> {
    event.stopPropagation();
    await this.workflow.deleteProject(summary);
  }

  protected async retryLoad(): Promise<void> {
    await this.workflow.loadProjects();
  }
  protected validDimensions(): boolean {
    return this.sizePolicy().dimensionsValid;
  }
  protected canCreateProject(): boolean {
    return isStructureCreationAllowed(this.enteredSize(), this.effectiveStructureMode());
  }
  private async loadVersions(): Promise<void> {
    try {
      await this.versions.loadReleases();
    } catch {
      /* Keep the safe 1.21.1 fallback when Mojang metadata is offline. */
    }
  }

  private structureJsonValidationError(code: string | undefined): string {
    const key =
      code === 'invalid-json'
        ? 'structureJsonValidationInvalidJson'
        : code === 'format'
          ? 'structureJsonValidationFormat'
          : code === 'version'
            ? 'structureJsonValidationVersion'
            : code === 'minecraft-version'
              ? 'structureJsonValidationMinecraftVersion'
              : code === 'block'
                ? 'structureJsonValidationBlock'
                : 'structureJsonValidationShape';
    return this.i18n.t(key);
  }
  private structureJsonProjectImportError(code: StructureJsonProjectImportError): string {
    const key = (
      {
        'empty-structure': 'structureJsonProjectEmpty',
        'negative-coordinates': 'structureJsonProjectNegativeCoordinates',
        'unsupported-size': 'hugeStructureBlocksLimitExceeded',
        validation: 'structureJsonProjectValidationError',
        'invalid-project': 'structureJsonProjectValidationError',
      } as const
    )[code];
    return this.i18n.t(key);
  }
}
