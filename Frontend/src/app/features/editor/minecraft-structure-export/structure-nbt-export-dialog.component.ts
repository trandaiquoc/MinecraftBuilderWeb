import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, computed, inject, output, signal } from '@angular/core';
import { LucideDownload, LucideX } from '@lucide/angular';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { MinecraftStructureExportService, type StructureExportForm, type StructureExportMode, type StructureExportDownloadResult } from '../../../core/persistence/minecraft-structure/minecraft-structure-export.service';
import type { StructurePackagingDiagnostic } from '../../../core/persistence/minecraft-structure/minecraft-structure-packaging';

@Component({
  selector: 'app-structure-nbt-export-dialog',
  imports: [CdkTrapFocus, LucideDownload, LucideX],
  templateUrl: './structure-nbt-export-dialog.component.html',
  styleUrl: './structure-nbt-export-dialog.component.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class StructureNbtExportDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly workspace = inject(WorkspaceStateService);
  private readonly exporter = inject(MinecraftStructureExportService);
  readonly closed = output<void>();

  protected readonly mode = signal<StructureExportMode>('datapack');
  protected readonly namespace = signal('');
  protected readonly structurePath = signal('');
  protected readonly archiveName = signal('');
  protected readonly description = signal('');
  protected readonly busy = signal(false);
  protected readonly result = signal<StructureExportDownloadResult | undefined>(undefined);
  protected readonly errorDiagnostics = signal<readonly StructurePackagingDiagnostic[]>([]);
  protected readonly form = computed<StructureExportForm>(() => ({ namespace: this.namespace(), structurePath: this.structurePath(), archiveName: this.archiveName(), description: this.description() }));
  protected readonly preflight = computed(() => this.exporter.preflight(this.mode(), this.form(), this.workspace.project()));
  protected readonly metadata = computed(() => this.preflight().metadata);
  protected readonly canDownload = computed(() => !this.busy() && !!this.workspace.project() && this.preflight().ok);
  protected readonly sizeWarning = computed(() => this.metadata()?.sizeClass === 'huge');
  protected readonly projectName = computed(() => this.workspace.project()?.metadata.name ?? '');

  ngOnInit(): void {
    const defaults = this.exporter.defaults();
    if (!defaults) return;
    this.namespace.set(defaults.namespace);
    this.structurePath.set(defaults.structurePath);
    this.archiveName.set(defaults.archiveName);
    this.description.set(defaults.description);
  }

  protected onEscape(): void { if (!this.busy()) this.close(); }
  protected close(): void { this.closed.emit(); }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget && !this.busy()) this.close(); }
  protected setMode(mode: StructureExportMode): void { if (this.busy()) return; this.mode.set(mode); this.result.set(undefined); this.errorDiagnostics.set([]); }
  protected setField(field: 'namespace' | 'structurePath' | 'archiveName' | 'description', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    if (field === 'namespace') this.namespace.set(value);
    else if (field === 'structurePath') this.structurePath.set(value);
    else if (field === 'archiveName') this.archiveName.set(value);
    else this.description.set(value);
    this.result.set(undefined);
    this.errorDiagnostics.set([]);
  }
  protected async download(): Promise<void> {
    if (!this.canDownload() || this.busy()) return;
    this.busy.set(true); this.result.set(undefined); this.errorDiagnostics.set([]);
    try {
      const result = await this.exporter.download(this.mode(), this.form(), this.workspace.project());
      if (result.ok) this.result.set(result);
      else this.errorDiagnostics.set(result.diagnostics);
    } finally { this.busy.set(false); }
  }
  protected diagnosticText(diagnostic: StructurePackagingDiagnostic): string { return diagnostic.path ? `${diagnostic.message} (${diagnostic.path})` : diagnostic.message; }
}
