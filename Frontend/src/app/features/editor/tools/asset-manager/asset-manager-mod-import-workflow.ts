import { Injectable, signal } from '@angular/core';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { ModImportProgress, PreparedModImport } from '../../../../core/assets/mod/external-mod-importer';
import { ModImportTimeoutError } from '../../../../core/assets/mod/mod-import-cancellation';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { JarUploadValidationError, validateJarUpload } from '../../../../core/assets/mod/jar-upload-validation';
import { phaseLabels, type ImportOperationStatus } from './asset-manager-mod-presentation';

@Injectable()
export class AssetManagerModImportWorkflow {
  readonly importing = signal(false);
  readonly modError = signal('');
  readonly preflight = signal<PreparedModImport | undefined>(undefined);
  readonly preflightProgress = signal<ModImportProgress | undefined>(undefined);
  readonly preflightError = signal('');
  readonly preflightIconUrl = signal<string | undefined>(undefined);
  readonly operationKind = signal<'preflight' | 'commit' | undefined>(undefined);
  readonly operationStatus = signal<ImportOperationStatus>(undefined);

  private generation = 0;
  private controller?: AbortController;
  private retryFile?: File;
  private disposed = false;

  constructor(private readonly assets: ContentAssetRuntimeService, private readonly i18n: I18nService) {}

  async inspect(file: File): Promise<void> {
    if (this.disposed) return;
    if (this.importing()) this.cancel();
    try {
      validateJarUpload(file);
    } catch (error) {
      this.preflightError.set(this.jarValidationMessage(error));
      return;
    }

    this.retryFile = file;
    this.cancel();
    this.preflight.set(undefined);
    this.beginOperation('preflight');
    this.modError.set('');
    this.preflightError.set('');
    this.preflightProgress.set(undefined);
    const generation = this.generation;
    const controller = this.controller!;

    try {
      const prepared = await this.assets.inspectModJar(
        file,
        (progress) => { if (this.isCurrent(generation, controller)) this.preflightProgress.set(progress); },
        controller.signal,
      );
      if (!this.isCurrent(generation, controller)) {
        prepared.dispose();
        return;
      }
      this.preflight.set(prepared);
      this.preflightIconUrl.set(this.createPreflightIcon(prepared));
      this.operationStatus.set(prepared.canActivate ? 'ready' : 'failed');
      this.assets.activity.finish('mod-preflight', this.i18n.t('assetManagerImportReady'), 'mod');
    } catch (error) {
      if (!this.isCurrent(generation, controller)) return;
      this.reportFailure(error, 'preflight');
    } finally {
      if (this.isCurrent(generation, controller)) this.finishOperation();
    }
  }

  async confirm(): Promise<boolean> {
    if (this.disposed) return false;
    const prepared = this.preflight();
    if (!prepared || !prepared.canActivate || this.importing()) return false;

    this.beginOperation('commit');
    this.modError.set('');
    const generation = this.generation;
    const controller = this.controller!;
    try {
      await this.assets.commitPreparedModImport(
        prepared,
        (progress) => { if (this.isCurrent(generation, controller)) this.preflightProgress.set(progress); },
        controller.signal,
      );
      if (!this.isCurrent(generation, controller)) return false;
      this.preflight.set(undefined);
      this.preflightProgress.set(undefined);
      this.operationStatus.set(undefined);
      this.assets.activity.finish('mod-import', this.i18n.t('assetManagerImported'), 'mod');
      return true;
    } catch (error) {
      if (!this.isCurrent(generation, controller)) return false;
      this.reportFailure(error, 'commit');
      return false;
    } finally {
      if (this.isCurrent(generation, controller)) {
        prepared.dispose();
        this.revokePreflightIcon();
        this.finishOperation();
      }
    }
  }

  cancel(): void {
    if (this.controller && !this.controller.signal.aborted) this.operationStatus.set('cancelling');
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    this.preflight()?.dispose();
    this.revokePreflightIcon();
    this.preflight.set(undefined);
    this.preflightProgress.set(undefined);
    this.preflightError.set('');
    const kind = this.operationKind();
    if (!kind) return;
    this.assets.activity.cancel(kind === 'commit' ? 'mod-import' : 'mod-preflight', this.i18n.t('assetManagerTaskCancelled'), 'mod');
    this.operationKind.set(undefined);
    this.operationStatus.set('cancelled');
    this.importing.set(false);
  }

  retry(): void {
    if (this.disposed || !this.retryFile || this.importing()) return;
    void this.inspect(this.retryFile);
  }

  canRetry(): boolean { return !!this.retryFile && !this.importing(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.retryFile = undefined;
  }

  timeoutMessage(error: ModImportTimeoutError): string {
    const phase = error.phase as ModImportProgress['phase'];
    const phaseLabel = this.i18n.t(phaseLabels[phase]);
    return `${this.i18n.t('assetManagerTaskTimedOut')}: ${phaseLabel}. ${this.i18n.t('assetManagerNoProgress').replace('{seconds}', String(Math.round(error.timeoutMs / 1000)))}`;
  }

  private beginOperation(kind: 'preflight' | 'commit'): void {
    this.controller?.abort();
    this.generation += 1;
    this.controller = new AbortController();
    this.operationKind.set(kind);
    this.operationStatus.set('running');
    this.importing.set(true);
    this.assets.activity.begin(kind === 'commit' ? 'mod-import' : 'mod-preflight', this.i18n.t('assetManagerImporting'), 'mod');
  }

  private finishOperation(): void {
    this.controller = undefined;
    this.operationKind.set(undefined);
    this.importing.set(false);
  }

  private isCurrent(generation: number, controller: AbortController): boolean {
    return !this.disposed && generation === this.generation && this.controller === controller && !controller.signal.aborted;
  }

  private reportFailure(error: unknown, operation: 'preflight' | 'commit'): void {
    const activityOperation = operation === 'commit' ? 'mod-import' : 'mod-preflight';
    if (isAbortError(error)) {
      if (error instanceof ModImportTimeoutError) {
        this.operationStatus.set('timed-out');
        const message = this.timeoutMessage(error);
        if (operation === 'commit') this.modError.set(message);
        else this.preflightError.set(message);
        this.assets.activity.timeout(activityOperation, message, 'mod');
      } else {
        this.operationStatus.set('cancelled');
        this.assets.activity.cancel(activityOperation, this.i18n.t('assetManagerTaskCancelled'), 'mod');
      }
      return;
    }
    const message = error instanceof Error ? error.message : this.i18n.t('assetManagerImportError');
    this.operationStatus.set('failed');
    if (operation === 'commit') this.modError.set(message);
    else this.preflightError.set(message);
    this.assets.activity.fail(activityOperation, message, 'mod');
  }

  private jarValidationMessage(error: unknown): string {
    if (error instanceof JarUploadValidationError) return this.i18n.t(error.code === 'jar-extension' ? 'assetManagerJarOnly' : 'assetManagerJarTooLarge');
    return error instanceof Error ? error.message : this.i18n.t('assetManagerImportError');
  }

  private createPreflightIcon(prepared: PreparedModImport): string | undefined {
    const path = prepared.normalizedMetadata?.icon;
    const bytes = path ? prepared.resources.get(path) : undefined;
    if (!bytes || typeof URL === 'undefined') return undefined;
    return URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' }));
  }

  private revokePreflightIcon(): void {
    const url = this.preflightIconUrl();
    if (url && typeof URL !== 'undefined') URL.revokeObjectURL(url);
    this.preflightIconUrl.set(undefined);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof ModImportTimeoutError
    || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError');
}
