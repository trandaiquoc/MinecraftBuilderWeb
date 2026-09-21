import type { VanillaResourceFormatProfile } from '../vanilla-resource-format';

export type CompatibilityClassification = 'compatible-reused' | 'changed-needs-delta' | 'new-generic-supported' | 'unsupported';

export interface CompatibilityEntry {
  readonly minecraftVersion: string;
  readonly id: string;
  readonly classification: CompatibilityClassification;
  readonly family?: string;
  readonly resourceFormat: VanillaResourceFormatProfile['support'];
  readonly reasonCode?: string;
  readonly message?: string;
  readonly expectedProperties?: readonly string[];
  readonly actualProperties?: readonly string[];
  readonly missingProperties?: readonly string[];
  readonly extraProperties?: readonly string[];
  readonly invalidDefaultValues?: readonly string[];
  readonly blockstatePath?: string;
  readonly modelIds?: readonly string[];
  readonly unresolvedModels?: readonly string[];
  readonly textureResources?: readonly string[];
  readonly resolverSupport?: string;
  readonly visualClassification?: string;
  readonly behaviorSupport?: string;
  readonly defaultStateSource?: string;
  readonly behaviorImplementation?: string;
  readonly behaviorCompatibility?: 'reused' | 'changed' | 'unknown';
  readonly logicalObjectCompatibility?: 'reused' | 'changed' | 'not-applicable';
  readonly specialRendererFamily?: string;
  readonly specialRendererCompatibility?: 'reused' | 'missing-resource' | 'not-applicable';
  readonly stateContract?: readonly string[];
  readonly missingResources?: readonly string[];
  readonly variantPairs?: readonly string[];
}

export interface CompatibilityReportSummary {
  readonly compatibleReused: number;
  readonly changedNeedsDelta: number;
  readonly newGenericSupported: number;
  readonly unsupported: number;
}

export interface CompatibilityReport {
  readonly schemaVersion: 1;
  readonly minecraftVersion: string;
  readonly generatedAt: string;
  readonly resourceFormat: VanillaResourceFormatProfile;
  readonly summary: CompatibilityReportSummary;
  readonly compatibleReused: readonly CompatibilityEntry[];
  readonly changedNeedsDelta: readonly CompatibilityEntry[];
  readonly newGenericSupported: readonly CompatibilityEntry[];
  readonly unsupported: readonly CompatibilityEntry[];
}
