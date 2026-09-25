import type { BehaviorSupportLevel, BlockVisualClassification, VisualSupportLevel } from '../catalog/block-definition.types';

/** Confidence describes the evidence behind a capability, not rendering/behavior support. */
export type BlockCapabilityEvidence = 'verified' | 'inferred';

export type BlockDirectionMode = 'horizontal' | 'six-face';
export type BlockRotationMode = 'four-step' | 'sixteen-step';
export type BlockAttachmentSurface = 'floor' | 'wall' | 'ceiling' | 'chain';
export type BlockMultiBlockMode = 'double-height' | 'paired-horizontal';
export type BlockEntityKind = 'sign' | 'decorated-pot' | 'conduit' | 'generic';

interface CapabilityBase<TKind extends string> {
  readonly kind: TKind;
  readonly evidence: BlockCapabilityEvidence;
}

export type BlockCapability =
  | CapabilityBase<'standard-json-render'>
  | CapabilityBase<'special-renderer'>
  | CapabilityBase<'intentionally-invisible'>
  | (CapabilityBase<'directional'> & { readonly mode: BlockDirectionMode })
  | (CapabilityBase<'rotatable'> & { readonly mode: BlockRotationMode })
  | (CapabilityBase<'attachment'> & { readonly surfaces: readonly BlockAttachmentSurface[] })
  | (CapabilityBase<'neighbor-dependent'> & { readonly family?: string })
  | (CapabilityBase<'multi-block'> & { readonly mode: BlockMultiBlockMode })
  | (CapabilityBase<'block-entity'> & { readonly entityKind: BlockEntityKind })
  | (CapabilityBase<'inventory-storage'> & { readonly slotCount?: number })
  | (CapabilityBase<'item-display'> & { readonly slotCount: number })
  | (CapabilityBase<'item-storage-display'> & { readonly slotCount: number })
  | (CapabilityBase<'fluid'> & { readonly fluid: 'water' | 'lava' })
  /** Verified ordinary placement contract; no executable neighbor behavior is implied. */
  | CapabilityBase<'direct-placement'>
  /** Verified pillar-like placement contract (for example log/stem families). */
  | (CapabilityBase<'axis-oriented'> & { readonly axisProperty: string })
  | CapabilityBase<'waterloggable'>
  | CapabilityBase<'item-backed'>;

export type BlockCapabilityKind = BlockCapability['kind'];
export type BlockCapabilityProfile = readonly BlockCapability[];

export interface BlockCapabilityDiagnosticInput {
  readonly capabilities: BlockCapabilityProfile;
  readonly behaviorSupport: BehaviorSupportLevel;
  readonly visualSupport: VisualSupportLevel;
  readonly visualClassification: BlockVisualClassification;
}

export interface BlockCapabilityDiagnostics extends BlockCapabilityDiagnosticInput {
  readonly evidence: Readonly<Partial<Record<BlockCapabilityKind, BlockCapabilityEvidence>>>;
}
