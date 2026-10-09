import type { AssetActivityEntry } from '../../../../core/assets/asset-activity.service';
import type { ModImportProgress } from '../../../../core/assets/mod/external-mod-importer';
import type { TranslationKey } from '../../../../core/ui/localization/translation-catalogs';
import type { ModImportReport } from '../../../../core/assets/mod/external-mod-import-contracts';

export type ImportStage = 'reading' | 'compatibility' | 'resources' | 'content' | 'validation' | 'import';
export type ImportStageState = 'pending' | 'active' | 'complete' | 'awaiting-user' | 'blocked';
export type ImportOperationKind = 'preflight' | 'commit' | undefined;
export type ImportOperationStatus = 'running' | 'cancelling' | 'cancelled' | 'timed-out' | 'failed' | 'ready' | undefined;

export const importStages: readonly { readonly id: ImportStage; readonly phases: readonly ModImportProgress['phase'][]; readonly label: TranslationKey }[] = [
  { id: 'reading', phases: ['opening-archive', 'reading-metadata'], label: 'assetManagerReadingJar' },
  { id: 'compatibility', phases: ['checking-compatibility'], label: 'assetManagerCompatibility' },
  { id: 'resources', phases: ['indexing-resources', 'extracting-resources'], label: 'assetManagerResourcesStage' },
  { id: 'content', phases: ['discovering-blocks', 'discovering-items', 'discovering-decorations', 'evaluating-behavior'], label: 'assetManagerDiscoveringContent' },
  { id: 'validation', phases: ['checking-conflicts'], label: 'assetManagerValidationStage' },
  { id: 'import', phases: ['saving-cache', 'finalizing-cache', 'activating'], label: 'assetManagerImportStage' },
];

export const phaseLabels = {
  'opening-archive': 'assetPhase_opening_archive', 'reading-metadata': 'assetPhase_reading_metadata', 'checking-compatibility': 'assetPhase_checking_compatibility',
  'indexing-resources': 'assetPhase_indexing_resources', 'extracting-resources': 'assetPhase_extracting_resources', 'discovering-blocks': 'assetPhase_discovering_blocks',
  'discovering-items': 'assetPhase_discovering_items', 'discovering-decorations': 'assetPhase_discovering_decorations', 'evaluating-behavior': 'assetPhase_evaluating_behavior',
  'checking-conflicts': 'assetPhase_checking_conflicts', 'saving-cache': 'assetPhase_saving_cache', 'finalizing-cache': 'assetPhase_finalizing_cache', activating: 'assetPhase_activating',
} as const satisfies Record<ModImportProgress['phase'], TranslationKey>;

export function filterAssetActivity(entries: readonly AssetActivityEntry[], tab: 'vanilla' | 'mods'): readonly AssetActivityEntry[] {
  return entries.filter((entry) => tab === 'mods' ? entry.category === 'mod' : entry.category === 'vanilla' || entry.category === 'cache');
}

export function importStageForPhase(phase: ModImportProgress['phase']): ImportStage | undefined {
  return importStages.find((stage) => stage.phases.includes(phase))?.id;
}

export function compactContentCount(imported: number, detected: number, label: string): string {
  return imported === detected ? `${imported} ${label}` : `${imported} / ${detected} ${label}`;
}

export function progressPercentForProgress(progress: Pick<ModImportProgress, 'processed' | 'total'>): number | undefined {
  return progress.total && progress.total > 0 && progress.processed !== undefined
    ? Math.min(100, Math.max(0, progress.processed / progress.total * 100))
    : undefined;
}

export interface ImportStageStateContext {
  readonly operationKind: ImportOperationKind;
  readonly operationStatus: ImportOperationStatus;
  readonly prepared: boolean;
  readonly canActivate: boolean;
  readonly progressPhase?: ModImportProgress['phase'];
}

export function importStageState(stage: ImportStage, context: ImportStageStateContext): ImportStageState {
  const stageIndex = importStages.findIndex((candidate) => candidate.id === stage);
  const currentIndex = context.progressPhase ? importStages.findIndex((candidate) => candidate.phases.includes(context.progressPhase!)) : -1;
  if (context.operationKind === 'commit') return stageIndex < importStages.length - 1 ? 'complete' : 'active';
  if (context.operationKind === 'preflight') {
    if (currentIndex < 0) return 'pending';
    return stageIndex < currentIndex ? 'complete' : stageIndex === currentIndex ? 'active' : 'pending';
  }
  if (!context.prepared) return 'pending';
  if (!context.canActivate) {
    if (stage === 'validation' || stage === 'import') return 'blocked';
    return stageIndex < importStages.length - 2 ? 'complete' : 'pending';
  }
  if (context.operationStatus === 'failed' || context.operationStatus === 'cancelled' || context.operationStatus === 'timed-out') {
    return stage === 'import' ? 'blocked' : stageIndex < importStages.length - 1 ? 'complete' : 'pending';
  }
  if (context.operationStatus === 'ready' && stage === 'import') return 'awaiting-user';
  return stageIndex < importStages.length - 1 ? 'complete' : 'pending';
}

export function importPhaseState(phase: ModImportProgress['phase'], context: ImportStageStateContext): 'pending' | 'active' | 'complete' {
  const currentIndex = context.progressPhase ? allImportPhases.indexOf(context.progressPhase) : -1;
  const phaseIndex = allImportPhases.indexOf(phase);
  if (currentIndex < 0) return 'pending';
  if (context.operationKind) return phaseIndex < currentIndex ? 'complete' : phaseIndex === currentIndex ? 'active' : 'pending';
  return phaseIndex <= currentIndex ? 'complete' : 'pending';
}

export type DiagnosticPresentation = 'none' | 'technical' | 'prominent';

export function diagnosticPresentation(report: Pick<ModImportReport, 'diagnostics'>): DiagnosticPresentation {
  const hasBlocking = report.diagnostics.some((diagnostic) => diagnostic.severity === 'error' || diagnostic.category === 'blocking');
  const hasWarning = report.diagnostics.some((diagnostic) => diagnostic.severity === 'warning' || diagnostic.category === 'warning');
  if (hasBlocking || hasWarning) return 'prominent';
  return report.diagnostics.some((diagnostic) => diagnostic.severity === 'info' || diagnostic.category === 'info') ? 'technical' : 'none';
}

const allImportPhases = importStages.flatMap(({ phases }) => phases);
