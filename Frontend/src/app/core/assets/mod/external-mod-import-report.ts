import { discoverPaintingVariants } from './external-mod-painting-catalog';
import { externalItemEvidence } from './external-mod-item-evidence';
import {
  isModConflictDiagnostic,
  type ModImportDiagnostic,
  type ModImportReport,
} from './external-mod-import-contracts';
import type {
  FabricModMetadata,
  ModCompatibilityResult,
  NormalizedModMetadata,
} from './mod-loader';

export interface ExternalModImportReportInput {
  readonly sourceId: string;
  readonly metadata: FabricModMetadata;
  readonly normalizedMetadata: NormalizedModMetadata;
  readonly namespaces: readonly string[];
  readonly json: Readonly<Record<string, unknown>>;
  readonly binaryResourceCount: number;
  readonly minecraftVersion: string;
  readonly compatibility: ModCompatibilityResult;
  readonly diagnostics: readonly ModImportDiagnostic[];
}

export function buildExternalModImportReport(input: ExternalModImportReportInput): ModImportReport {
  const blockCandidates = Object.keys(input.json).filter((path) =>
    /^assets\/[^/]+\/blockstates\/.*\.json$/.test(path),
  );
  const itemCount = externalItemEvidence(input.json).length;
  const decorationCount = discoverPaintingVariants(
    input.json,
    input.sourceId,
    input.normalizedMetadata.displayName,
  ).length;
  const blocking = input.diagnostics.some((diagnostic) => diagnostic.severity === 'error');

  return {
    metadataFormat: input.normalizedMetadata.loader,
    loader: input.normalizedMetadata.loader,
    loaderSupported: input.normalizedMetadata.loader === 'fabric',
    metadata: input.metadata,
    normalizedMetadata: input.normalizedMetadata,
    namespaces: [...input.namespaces],
    retainedResourceCount: Object.keys(input.json).length + input.binaryResourceCount,
    candidateBlockCount: blockCandidates.length,
    compatibility: input.compatibility,
    projectMinecraftVersion: input.minecraftVersion,
    canActivate:
      input.normalizedMetadata.loader === 'fabric' &&
      input.compatibility.status === 'compatible' &&
      !blocking,
    blocks: {
      detected: blockCandidates.length,
      imported: blockCandidates.length,
      partial: blockCandidates.length,
      unsupported: 0,
    },
    items: { detected: itemCount, indexed: itemCount, unsupportedVisuals: 0 },
    decorations: {
      detected: decorationCount,
      imported: decorationCount,
      partial: 0,
      unsupported: 0,
    },
    conflicts: input.diagnostics.filter(isModConflictDiagnostic),
    warnings: input.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
    diagnostics: [...input.diagnostics],
    runtimeDependencies: input.normalizedMetadata.runtimeDependencies,
    nestedJarCount: input.normalizedMetadata.nestedJars.length,
  };
}
