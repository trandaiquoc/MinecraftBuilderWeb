export type BlockSupportLevel = 'full' | 'partial' | 'fallback';
export type BehaviorSupportLevel = 'full' | 'partial' | 'unknown';
export type VisualSupportLevel = 'real' | 'partial' | 'fallback';
export type BlockVisualClassification = 'standard-json' | 'special-renderer-required' | 'intentionally-invisible';
export type DefaultStateSource = 'authoritative-report' | 'verified-fixture' | 'unknown';

export interface BlockStateDefinition {
  readonly name: string;
  readonly values: readonly string[];
  readonly derived?: boolean;
}

export interface BlockResourceReference {
  readonly blockstate?: string;
  readonly model?: string;
  readonly textures: readonly string[];
}

export type BlockBehavior =
  | { readonly kind: 'solid' }
  | { readonly kind: 'horizontal-connect'; readonly family: 'fence' | 'pane' | 'wall'; readonly connectionGroup: string; readonly compatibleGroups: readonly string[]; readonly connectsToSolid: boolean; readonly derivedProperties: readonly string[] }
  | { readonly kind: 'stairs'; readonly derivedProperties: readonly ['shape'] }
  | { readonly kind: 'wall-mounted'; readonly facingProperty: 'facing' }
  | { readonly kind: 'wall-sign'; readonly facingProperty: 'facing' }
  | { readonly kind: 'standing-sign'; readonly rotationProperty: 'rotation'; readonly wallBlockId: string }
  | { readonly kind: 'hanging-sign'; readonly rotationProperty: 'rotation'; readonly attachedProperty: 'attached'; readonly wallBlockId: string }
  | { readonly kind: 'wall-hanging-sign'; readonly facingProperty: 'facing' }
  | { readonly kind: 'floor-supported' }
  | { readonly kind: 'vertical-chain'; readonly axisProperty: 'axis'; readonly verticalAxis: 'y' }
  | { readonly kind: 'lantern-placement'; readonly hangingProperty: 'hanging'; readonly chainId: string }
  | { readonly kind: 'torch-placement'; readonly wallBlockId: string }
  | { readonly kind: 'double-height'; readonly halfProperty: 'half'; readonly requiresFloor: boolean }
  | { readonly kind: 'paired-horizontal'; readonly partProperty: 'part'; readonly facingProperty: 'facing'; readonly firstPart: 'foot'; readonly secondPart: 'head' }
  | { readonly kind: 'candle'; readonly candlesProperty: 'candles'; readonly maxCandles: 4 }
  | { readonly kind: 'six-face-placement'; readonly facingProperty: 'facing' }
  | { readonly kind: 'decorated-pot-placement'; readonly facingProperty: 'facing' }
  | { readonly kind: 'conduit-placement'; readonly waterloggedProperty: 'waterlogged' }
  | { readonly kind: 'fluid'; readonly fluid: 'water' | 'lava' }
  | { readonly kind: 'head-placement'; readonly wall: boolean; readonly rotationProperty: 'rotation'; readonly facingProperty: 'facing' };

export interface BlockDefinition {
  readonly id: string;
  readonly namespace: string;
  readonly displayName: string;
  readonly modName?: string;
  readonly defaultState: Readonly<Record<string, string>>;
  readonly stateDefinitions: readonly BlockStateDefinition[];
  readonly resources: BlockResourceReference;
  readonly behaviorSupport: BehaviorSupportLevel;
  readonly visualSupport: VisualSupportLevel;
  readonly visualClassification: BlockVisualClassification;
  readonly defaultStateSource: DefaultStateSource;
  /** Compatibility alias for existing placement code; do not use for coverage reporting. */
  readonly support: BlockSupportLevel;
  readonly behavior?: BlockBehavior;
}

/** Input produced by an approved asset extractor; it is kept separate from trusted registry entries. */
export interface AssetBlockRecord {
  readonly id: string;
  readonly displayName: string;
  readonly defaultState: Readonly<Record<string, string>>;
  readonly stateDefinitions: readonly BlockStateDefinition[];
  readonly resources: BlockResourceReference;
  readonly support?: BlockSupportLevel;
  readonly behaviorSupport?: BehaviorSupportLevel;
  readonly visualSupport?: VisualSupportLevel;
  readonly visualClassification?: BlockVisualClassification;
  readonly defaultStateSource?: DefaultStateSource;
  readonly modName?: string;
  readonly behavior?: BlockBehavior;
}
