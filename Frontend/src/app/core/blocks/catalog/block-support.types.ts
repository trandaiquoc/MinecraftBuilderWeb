export type BlockSupportLevel = 'full' | 'partial' | 'fallback';
export type BehaviorSupportLevel = 'full' | 'partial' | 'unknown';
export type VisualSupportLevel = 'real' | 'partial' | 'fallback';
export type BlockVisualClassification =
  'standard-json' | 'special-renderer-required' | 'intentionally-invisible';
export type DefaultStateSource =
  | 'authoritative-report'
  | 'verified-fixture'
  | 'compatible-common'
  | 'resource-derived'
  | 'resource-render-fallback'
  | 'unknown';
