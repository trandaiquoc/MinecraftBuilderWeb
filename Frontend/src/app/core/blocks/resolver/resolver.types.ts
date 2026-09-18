import { BlockStateDefinition, BlockSupportLevel } from '../block-definition.types';
import { BlockState } from '../../domain/project.types';

export interface AssetResourceProvider {
  readJson(path: string): unknown | undefined;
}

export class MemoryAssetResourceProvider implements AssetResourceProvider {
  constructor(private readonly resources: Readonly<Record<string, unknown>>) {}
  readJson(path: string): unknown | undefined { return this.resources[path]; }
}

export interface ModelTransform {
  readonly x: number;
  readonly y: number;
  readonly uvlock: boolean;
}

export interface ResolvedFace {
  readonly texture: string;
  readonly uv?: readonly [number, number, number, number];
  readonly rotation?: number;
  readonly cullface?: string;
  readonly tintindex?: number;
}

export interface ResolvedElementRotation {
  readonly origin: readonly [number, number, number];
  readonly axis: 'x' | 'y' | 'z';
  readonly angle: number;
  readonly rescale: boolean;
}

export interface ResolvedElement {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly rotation?: ResolvedElementRotation;
  readonly shade?: boolean;
  readonly faces: Readonly<Record<string, ResolvedFace>>;
}

export interface ResolvedModelPart {
  readonly model: string;
  readonly weight: number;
  readonly transform: ModelTransform;
  readonly elements: readonly ResolvedElement[];
  readonly textures: Readonly<Record<string, string>>;
  readonly ambientOcclusion?: boolean;
}

export type ResolverDiagnosticCode =
  | 'missing-blockstate'
  | 'malformed-blockstate'
  | 'no-matching-variant'
  | 'missing-model'
  | 'malformed-model'
  | 'missing-parent'
  | 'parent-cycle'
  | 'missing-texture'
  | 'texture-cycle'
  | 'unsupported-model-behavior';

export interface ResolverDiagnostic {
  readonly code: ResolverDiagnosticCode;
  readonly message: string;
  readonly resource?: string;
}

export interface ResolvedBlockModel {
  readonly blockId: string;
  readonly state: BlockState;
  readonly parts: readonly ResolvedModelPart[];
  readonly support: BlockSupportLevel;
  readonly diagnostics: readonly ResolverDiagnostic[];
  readonly trace: ResolverTrace;
}

export interface ResolverTrace {
  readonly blockstateResource: string;
  readonly matchedVariantKeys: readonly string[];
  readonly selectedModelIds: readonly string[];
  readonly modelResources: readonly string[];
  readonly parentResources: readonly string[];
  readonly elementCount: number;
  readonly faceCount: number;
  readonly textureResources: readonly string[];
}

export interface BlockStateRotationResult {
  readonly state?: BlockState;
  readonly supported: boolean;
  readonly diagnostics: readonly ResolverDiagnostic[];
}

export type ResolverStateDefinitions = readonly BlockStateDefinition[];
