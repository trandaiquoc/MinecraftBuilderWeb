import type { BlockCapabilityProfile } from '../../blocks/capabilities/block-capability.types';
import type {
  BehaviorSupportLevel,
  VisualSupportLevel,
} from '../../blocks/catalog/block-definition.types';
import type { VanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';
import type { ContentDomainAudit } from './vanilla-content-domain-audit';

export type AssetAuditReason =
  | 'DEFAULT_STATE_UNKNOWN'
  | 'DEFAULT_STATE_INCOMPLETE'
  | 'DEFAULT_STATE_VARIANT_NO_MATCH'
  | 'BLOCKSTATE_NOT_FOUND'
  | 'BLOCKSTATE_PARSE_FAILED'
  | 'VARIANT_NO_MATCH'
  | 'MULTIPART_NO_MATCH'
  | 'UNSUPPORTED_BLOCKSTATE_CONDITION'
  | 'MODEL_NOT_FOUND'
  | 'PARENT_NOT_FOUND'
  | 'PARENT_CYCLE'
  | 'NO_ELEMENTS'
  | 'UNSUPPORTED_MODEL_FORMAT'
  | 'SPECIAL_RENDERER_REQUIRED'
  | 'INTENTIONALLY_INVISIBLE'
  | 'TEXTURE_NOT_FOUND'
  | 'TEXTURE_VARIABLE_UNRESOLVED'
  | 'TEXTURE_DECODE_FAILED'
  | 'GEOMETRY_BUILD_FAILED'
  | 'UNSUPPORTED_ELEMENT_ROTATION'
  | 'UNSUPPORTED_UV_CASE';

export interface VanillaAssetAuditRecord {
  readonly registryId: string;
  readonly family: string;
  readonly catalog: {
    readonly found: true;
    readonly displayName: string;
    readonly behaviorSupport: BehaviorSupportLevel;
    readonly capabilities: BlockCapabilityProfile;
  };
  readonly defaultState: {
    readonly known: boolean;
    readonly source: string;
    readonly state: Readonly<Record<string, string>>;
  };
  readonly blockstate: {
    readonly resource: string;
    readonly exists: boolean;
    readonly parsed: boolean;
    readonly kind: 'variants' | 'multipart' | 'both' | 'other';
    readonly selectedConfigurationCount: number;
  };
  readonly model: {
    readonly ids: readonly string[];
    readonly parentResolved: boolean;
    readonly elementCount: number;
    readonly faceCount: number;
    readonly resources: readonly string[];
    readonly parentResources: readonly string[];
  };
  readonly texture: {
    readonly referencedCount: number;
    readonly resolvedCount: number;
    readonly missingCount: number;
    readonly decodeSuccessCount: number;
    readonly decodeFailureCount: number;
  };
  readonly geometry: {
    readonly buildSuccess: boolean;
    readonly geometryCount: number;
    readonly bounds?: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
  };
  readonly render: {
    readonly visualSupport: VisualSupportLevel;
    readonly classification:
      'standard-json' | 'special-renderer-required' | 'intentionally-invisible';
    readonly renderMode: 'real' | 'partial' | 'fallback';
    readonly fallbackReason?: AssetAuditReason;
    readonly reasons: readonly AssetAuditReason[];
  };
  readonly thumbnail: 'real' | 'fallback' | 'unavailable';
}

export interface VanillaAssetCoverageReport {
  readonly schemaVersion: 1;
  readonly minecraftVersion: string;
  readonly sourceName: string;
  readonly generatedAt: string;
  readonly methodology: readonly string[];
  readonly summary: {
    readonly totalEntries: number;
    readonly visual: Readonly<Record<VisualSupportLevel, number>>;
    readonly behavior: Readonly<Record<BehaviorSupportLevel, number>>;
    readonly thumbnail: Readonly<Record<'real' | 'fallback' | 'unavailable', number>>;
    readonly defaultState: { readonly known: number; readonly unknown: number };
    readonly specialRendererRequired: number;
    readonly intentionallyInvisible: number;
    readonly failureReasons: Readonly<Record<string, number>>;
    readonly families: Readonly<Record<string, number>>;
    readonly contentDomain: ContentDomainAudit;
  };
  readonly records: readonly VanillaAssetAuditRecord[];
}

export interface VanillaAssetAuditOptions {
  readonly registry?: VanillaBlockRegistry;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completed: number, total: number) => void;
  readonly decodeTexture?: (bytes: Uint8Array, path: string) => Promise<boolean>;
  readonly batchSize?: number;
}
