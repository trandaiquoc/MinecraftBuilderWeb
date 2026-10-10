import { signal } from '@angular/core';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { PaintingVariantCatalogService } from '../../decorations/catalog/painting-variant-catalog.service';
import { ContentOperationCoordinator } from '../content-operation-coordinator';
import { IndexedDbAssetCache } from '../cache/indexeddb-asset-cache';
import { AssetActivityService } from '../asset-activity.service';
import {
  ContentSourceRegistry,
  PreparedContentSource,
} from '../content-source/content-source-registry';
import { ExternalModProvider } from './external-mod-provider';
import type {
  ModImportDiagnostic,
  ModImportReport,
  SerializedExternalMod,
} from './external-mod-import-contracts';
import {
  commitModImport,
  inspectModJar,
  ModImportProgress,
  PreparedModImport,
} from './external-mod-importer';
import { createPhaseWatchdog, isAbortError, throwIfAborted } from './mod-import-cancellation';
import { validateJarUpload } from './jar-upload-validation';
import { yieldToBrowser } from '../cooperative-yield';
import type { ExternalCatalogProgress } from './external-mod-catalog-builder';

export interface ImportedModSummary {
  readonly sourceId: string;
  readonly modId: string;
  readonly displayName: string;
  readonly version: string;
  readonly namespaces: readonly string[];
  readonly candidateBlockCount: number;
  readonly fingerprint?: string;
  readonly iconUrl?: string;
  readonly report: ModImportReport;
}

export interface ExternalModPublicationPort {
  readonly sources: ContentSourceRegistry;
  activate(provider: ExternalModProvider, restoring: boolean): void;
  commitRestored(sources: readonly PreparedContentSource[]): void;
  remove(sourceId: string): void;
}

export interface ExternalModRestoreState {
  readonly phase: 'restoring-mods' | 'ready' | 'partial';
  readonly current: number;
  readonly total: number;
  readonly failed: number;
  readonly sourceName?: string;
}

/** Owns external-mod import, cache, removal, and restore lifecycle; publication stays with the combined content runtime. */
export class ExternalModContentLifecycle {
  readonly importedMods = signal<readonly ImportedModSummary[]>([]);
  private restoring = false;

  constructor(
    private readonly cache: IndexedDbAssetCache,
    private readonly activity: AssetActivityService,
    private readonly operations: ContentOperationCoordinator,
    private readonly publication: ExternalModPublicationPort,
    private readonly minecraftVersion: () => string,
  ) {}

  get isRestoring(): boolean {
    return this.restoring;
  }

  async importJar(file: File, signal?: AbortSignal): Promise<ModImportReport> {
    return this.operations.run(
      'foreground',
      async (sessionSignal) => {
        const protection = this.activity.protect(`Importing ${file.name}`);
        this.activity.begin('mod-import', `Reading ${file.name}`, 'mod');
        try {
          const prepared = await this.inspectJar(file, undefined, sessionSignal);
          let provider: ExternalModProvider | undefined;
          let activated = false;
          try {
            provider = commitModImport(
              prepared,
              (progress) => this.reportProgress(progress),
              sessionSignal,
            );
            this.assertSourceAvailable(provider);
            this.reportProgress({ phase: 'saving-cache' });
            const serialized = await provider.serializeForCacheAsync(
              (progress) =>
                this.reportProgress({
                  phase: 'saving-cache',
                  processed: progress.processed,
                  total: progress.total,
                }),
              sessionSignal,
            );
            this.reportProgress({ phase: 'finalizing-cache' });
            await this.cache.saveExternalMod(serialized, sessionSignal);
            this.reportProgress({ phase: 'activating' });
            throwIfAborted(sessionSignal);
            this.publication.activate(provider, false);
            activated = true;
            this.upsertSummary(provider);
            this.activity.finish('mod-import', `Imported ${provider.metadata.displayName}`, 'mod');
            return provider.report;
          } finally {
            prepared.dispose();
            if (provider && !activated) provider.dispose();
          }
        } catch (error) {
          if (isAbortError(error) || sessionSignal.aborted) throw error;
          this.activity.fail(
            'mod-import',
            error instanceof Error ? error.message : 'Mod import failed',
            'mod',
          );
          throw error;
        } finally {
          this.activity.releaseProtected(protection);
        }
      },
      signal,
    );
  }

  async inspectJar(
    file: File,
    onProgress?: (progress: ModImportProgress) => void,
    signal?: AbortSignal,
  ): Promise<PreparedModImport> {
    const prepared = await inspectModJar(
      file,
      this.minecraftVersion(),
      (progress) => {
        onProgress?.(progress);
        this.activity.update(
          progress.processed === undefined
            ? undefined
            : {
                loaded: progress.processed,
                ...(progress.total === undefined ? {} : { total: progress.total }),
              },
          progress.phase,
        );
      },
      signal,
    );
    throwIfAborted(signal);
    if (!prepared.report || !prepared.loaderSupported || !prepared.metadata) return prepared;
    try {
      const preview =
        prepared.provider ??
        ExternalModProvider.create({
          metadata: prepared.metadata,
          json: prepared.json,
          resources: prepared.resources,
          diagnostics: prepared.diagnostics,
          minecraftVersion: prepared.minecraftVersion,
          fingerprint: prepared.fingerprint,
        });
      const catalogWatchdog = createPhaseWatchdog('discovering-blocks', signal);
      try {
        await preview.prepareCatalog((progress) => {
          catalogWatchdog.progress();
          this.reportProgress({
            phase: 'discovering-blocks',
            processed: progress.processed,
            total: progress.total,
          });
          onProgress?.({
            phase: 'discovering-blocks',
            processed: progress.processed,
            total: progress.total,
          });
        }, catalogWatchdog.signal);
      } finally {
        catalogWatchdog.stop();
      }
      const resourceConflicts = this.publication.sources.resources.inspectProvider(preview);
      const catalog = preview.catalog();
      const conflictWatchdog = createPhaseWatchdog('checking-conflicts', signal);
      let catalogConflicts: readonly ReturnType<
        ContentSourceRegistry['inspectCatalogContribution']
      >[number][];
      try {
        catalogConflicts = await this.publication.sources.inspectCatalogContributionAsync(
          catalog,
          (progress) => {
            conflictWatchdog.progress();
            const event = {
              phase: 'checking-conflicts' as const,
              processed: progress.processed,
              total: progress.total,
            };
            onProgress?.(event);
            this.reportProgress(event);
          },
          conflictWatchdog.signal,
        );
      } finally {
        conflictWatchdog.stop();
      }
      const conflictDiagnostics: ModImportDiagnostic[] = [
        ...resourceConflicts.map((conflict) => ({
          severity: 'error' as const,
          category: 'blocking' as const,
          code:
            conflict.kind === 'tag-replacement'
              ? 'tag-replacement-unsupported'
              : 'resource-conflict',
          message:
            conflict.kind === 'tag-replacement'
              ? 'A tag replacement conflicts with an active content source.'
              : 'A retained resource path conflicts with an active content source.',
          path: conflict.path,
        })),
        ...catalogConflicts.map((conflict) => ({
          severity: 'error' as const,
          category: 'blocking' as const,
          code: `${conflict.kind}-conflict`,
          message: `A ${conflict.kind} is already provided by an active content source: ${conflict.id}.`,
        })),
      ];
      if (!conflictDiagnostics.length) return prepared;
      const diagnostics = [...prepared.diagnostics, ...conflictDiagnostics];
      return {
        ...prepared,
        diagnostics,
        report: {
          ...prepared.report,
          conflicts: [...prepared.report.conflicts, ...conflictDiagnostics],
          diagnostics,
          canActivate: false,
        },
        canActivate: false,
      };
    } catch (error) {
      throwIfAborted(signal);
      throw error;
    }
  }

  async commitPrepared(
    prepared: PreparedModImport,
    onProgress?: (progress: ModImportProgress) => void,
    signal?: AbortSignal,
  ): Promise<ModImportReport> {
    return this.operations.run(
      'foreground',
      async (sessionSignal) => {
        throwIfAborted(sessionSignal);
        const reportProgress = (progress: ModImportProgress): void => {
          onProgress?.(progress);
          this.reportProgress(progress);
        };
        const provider = commitModImport(prepared, reportProgress, sessionSignal);
        let activated = false;
        try {
          this.assertSourceAvailable(provider);
          reportProgress({ phase: 'saving-cache' });
          const saveWatchdog = createPhaseWatchdog('saving-cache', sessionSignal);
          let serialized;
          try {
            serialized = await provider.serializeForCacheAsync((progress) => {
              saveWatchdog.progress();
              reportProgress({
                phase: 'saving-cache',
                processed: progress.processed,
                total: progress.total,
              });
            }, saveWatchdog.signal);
          } finally {
            saveWatchdog.stop();
          }
          reportProgress({ phase: 'finalizing-cache' });
          const finalizeWatchdog = createPhaseWatchdog('finalizing-cache', sessionSignal);
          try {
            await this.cache.saveExternalMod(serialized, finalizeWatchdog.signal);
          } finally {
            finalizeWatchdog.stop();
          }
          throwIfAborted(sessionSignal);
          const activationWatchdog = createPhaseWatchdog('activating', sessionSignal);
          try {
            reportProgress({ phase: 'activating' });
            this.publication.activate(provider, false);
          } finally {
            activationWatchdog.stop();
          }
          activated = true;
          this.upsertSummary(provider);
          return provider.report;
        } finally {
          if (!activated) provider.dispose();
        }
      },
      signal,
    );
  }

  async remove(sourceId: string, signal?: AbortSignal): Promise<void> {
    await this.operations.run(
      'foreground',
      async (sessionSignal) => {
        if (!this.publication.sources.providerForSource(sourceId)) return;
        throwIfAborted(sessionSignal);
        this.publication.remove(sourceId);
        this.importedMods.update((mods) => mods.filter((mod) => mod.sourceId !== sourceId));
        await this.cache.deleteExternalMod(sourceId, sessionSignal);
      },
      signal,
    );
  }

  async restore(
    version: string,
    signal?: AbortSignal,
    onProgress?: (state: ExternalModRestoreState) => void,
  ): Promise<ExternalModRestoreState> {
    let stored: readonly SerializedExternalMod[] = [];
    try {
      stored = await this.cache.loadExternalMods(signal);
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw error;
      const state = { phase: 'partial' as const, current: 0, total: 0, failed: 1 };
      onProgress?.(state);
      return state;
    }
    throwIfAborted(signal);
    const total = stored.length;
    const publishProgress = (state: ExternalModRestoreState): void => onProgress?.(state);
    publishProgress({ phase: total ? 'restoring-mods' : 'ready', current: 0, total, failed: 0 });
    if (!total) return { phase: 'ready', current: 0, total: 0, failed: 0 };
    await yieldToBrowser(signal);
    let failed = 0;
    let current = 0;
    const staged: PreparedContentSource[] = [];
    const stagedProviders: ExternalModProvider[] = [];
    let committed = false;
    this.activity.begin('mod-restore', `Restoring imported Mods (0 / ${total})`, 'mod');
    this.restoring = true;
    try {
      for (const serialized of stored) {
        let sourceName = serialized.metadata?.displayName;
        let provider: ExternalModProvider | undefined;
        try {
          throwIfAborted(signal);
          const existing = this.publication.sources.providerForSource(serialized.sourceId) as
            ExternalModProvider | undefined;
          if (
            existing &&
            (!serialized.fingerprint || existing.fingerprint === serialized.fingerprint)
          ) {
            current += 1;
            publishProgress({
              phase: 'restoring-mods',
              current,
              total,
              failed,
              ...(sourceName ? { sourceName } : {}),
            });
            await yieldToBrowser(signal);
            continue;
          }
          provider = ExternalModProvider.deserialize(serialized, version);
          sourceName = provider.metadata.displayName;
          if (provider.report.canActivate === false) {
            provider.dispose();
            provider = undefined;
            failed += 1;
          } else {
            const catalog = await provider.prepareCatalog(
              (progress: ExternalCatalogProgress) =>
                this.activity.update(
                  { loaded: progress.processed, total: progress.total },
                  `Restoring ${sourceName} blocks (${progress.processed} / ${progress.total})`,
                ),
              signal,
            );
            throwIfAborted(signal);
            staged.push({ provider, catalog, replaceExisting: !!existing });
            stagedProviders.push(provider);
            provider = undefined;
          }
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) throw error;
          provider?.dispose?.();
          failed += 1;
        }
        current += 1;
        publishProgress({
          phase: 'restoring-mods',
          current,
          total,
          failed,
          ...(sourceName ? { sourceName } : {}),
        });
        this.activity.update(
          { loaded: current, total },
          sourceName
            ? `Restoring imported Mods (${current} / ${total}): ${sourceName}`
            : `Restoring imported Mods (${current} / ${total})`,
        );
        await yieldToBrowser(signal);
      }
      throwIfAborted(signal);
      if (staged.length) {
        this.activity.update({ loaded: current, total }, 'Committing imported Mods');
        try {
          this.publication.commitRestored(staged);
          for (const item of staged) this.upsertSummary(item.provider as ExternalModProvider);
          committed = true;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) throw error;
          failed += staged.length;
          this.activity.event(
            'mod-restore',
            error instanceof Error ? error.message : 'Imported Mod activation failed',
            'warning',
            'mod',
          );
        }
      }
    } finally {
      this.restoring = false;
      if (!committed)
        for (const provider of stagedProviders)
          if (!this.publication.sources.providerForSource(provider.source.id)) provider.dispose();
    }
    const state: ExternalModRestoreState = {
      phase: failed > 0 ? 'partial' : 'ready',
      current: Math.max(0, total),
      total: Math.max(0, total),
      failed: Math.max(0, failed),
    };
    publishProgress(state);
    this.activity.finish(
      'mod-restore',
      failed
        ? `Imported Mods restored with ${failed} warning${failed === 1 ? '' : 's'}`
        : 'Imported Mods restored',
      'mod',
    );
    return state;
  }

  clear(): void {
    this.importedMods.set([]);
  }

  private reportProgress(progress: ModImportProgress): void {
    this.activity.update(
      progress.processed === undefined
        ? undefined
        : {
            loaded: progress.processed,
            ...(progress.total === undefined ? {} : { total: progress.total }),
          },
      progress.phase,
    );
  }

  private assertSourceAvailable(provider: ExternalModProvider): void {
    const conflicts = this.publication.sources.resources.inspectProvider(provider);
    if (conflicts.length)
      throw new Error(
        `Mod resource conflict at ${conflicts[0].path} (${conflicts[0].sourceIds.join(', ')})`,
      );
    const contentConflicts = this.publication.sources.inspectCatalogContribution(
      provider.catalog(),
    );
    if (contentConflicts.length)
      throw new Error(
        `Mod ${contentConflicts[0].kind} conflict for ${contentConflicts[0].id} (${contentConflicts[0].sourceIds.join(', ')})`,
      );
  }

  private upsertSummary(provider: ExternalModProvider): void {
    const summary = summarizeMod(provider);
    this.importedMods.update((mods) =>
      [...mods.filter((mod) => mod.sourceId !== summary.sourceId), summary].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ),
    );
  }
}

function summarizeMod(provider: ExternalModProvider): ImportedModSummary {
  return {
    sourceId: provider.source.id,
    modId: provider.metadata.id,
    displayName: provider.metadata.displayName,
    version: provider.metadata.version,
    namespaces: provider.source.namespaces,
    candidateBlockCount: provider.report.candidateBlockCount,
    ...(provider.fingerprint ? { fingerprint: provider.fingerprint } : {}),
    ...(provider.iconUrl() ? { iconUrl: provider.iconUrl() } : {}),
    report: provider.report,
  };
}
