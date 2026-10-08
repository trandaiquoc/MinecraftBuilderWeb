import type { FabricModMetadata, ModCompatibilityResult, NormalizedModMetadata, SupportedModLoader } from './mod-loader';

export const EXTERNAL_MOD_CACHE_SCHEMA_VERSION = 2 as const;

export interface ModImportDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly category?: 'blocking' | 'warning' | 'info';
  readonly path?: string;
  readonly parameters?: Readonly<Record<string, string | number>>;
}

export interface ModImportCounts {
  readonly detected: number;
  readonly imported: number;
  readonly partial: number;
  readonly unsupported: number;
}

export interface ModImportReport {
  readonly metadataFormat: SupportedModLoader;
  readonly loader: SupportedModLoader;
  readonly loaderSupported: boolean;
  readonly metadata?: FabricModMetadata;
  readonly normalizedMetadata?: NormalizedModMetadata;
  readonly namespaces: readonly string[];
  readonly retainedResourceCount: number;
  readonly candidateBlockCount: number;
  readonly compatibility?: ModCompatibilityResult;
  readonly projectMinecraftVersion?: string;
  readonly canActivate?: boolean;
  readonly blocks: ModImportCounts;
  readonly items: { readonly detected: number; readonly indexed: number; readonly unsupportedVisuals: number };
  readonly decorations: ModImportCounts;
  readonly conflicts: readonly ModImportDiagnostic[];
  readonly warnings: readonly ModImportDiagnostic[];
  readonly diagnostics: readonly ModImportDiagnostic[];
  readonly runtimeDependencies: Readonly<Record<string, unknown>>;
  readonly nestedJarCount: number;
}

export interface SerializedExternalMod {
  readonly schemaVersion: typeof EXTERNAL_MOD_CACHE_SCHEMA_VERSION;
  readonly sourceId: string;
  readonly metadata: FabricModMetadata;
  readonly normalizedMetadata: NormalizedModMetadata;
  readonly minecraftRequirement?: string | readonly string[];
  readonly fingerprint?: string;
  readonly namespaces: readonly string[];
  readonly json: Readonly<Record<string, unknown>>;
  readonly binary: readonly { readonly path: string; readonly data: ArrayBuffer }[];
  readonly report: ModImportReport;
}

export interface ExternalModResourceInput {
  readonly metadata: unknown;
  readonly minecraftVersion?: string;
  readonly resources: ReadonlyMap<string, Uint8Array>;
  readonly json: ReadonlyMap<string, unknown>;
  readonly diagnostics?: readonly ModImportDiagnostic[];
  readonly fingerprint?: string;
}

export function isModConflictDiagnostic(diagnostic: ModImportDiagnostic): boolean {
  return diagnostic.code === 'resource-conflict'
    || diagnostic.code === 'tag-replacement-unsupported'
    || diagnostic.code === 'block-id-conflict'
    || diagnostic.code === 'item-id-conflict'
    || diagnostic.code === 'decoration-id-conflict';
}
