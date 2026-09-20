import type { BlockBehavior, BlockDefinition, BlockStateDefinition, BlockVisualClassification } from '../catalog/block-definition.types';
import {
  BlockAttachmentSurface,
  BlockCapability,
  BlockCapabilityDiagnosticInput,
  BlockCapabilityDiagnostics,
  BlockCapabilityEvidence,
  BlockCapabilityKind,
  BlockCapabilityProfile,
  BlockDirectionMode,
  BlockEntityKind,
  BlockMultiBlockMode,
  BlockRotationMode,
} from './block-capability.types';

export interface BlockCapabilityResolverInput {
  readonly behavior?: BlockBehavior;
  readonly visualClassification?: BlockVisualClassification;
  readonly visualClassificationEvidence?: BlockCapabilityEvidence;
  readonly stateDefinitions?: readonly BlockStateDefinition[];
  readonly explicit?: BlockCapabilityProfile;
}

/**
 * Derives orthogonal content capabilities in one place. This metadata never
 * replaces BlockBehavior, which remains the executable rule strategy.
 */
export function deriveBlockCapabilities(input: BlockCapabilityResolverInput): BlockCapabilityProfile {
  const values: BlockCapability[] = [];
  const add = (capability: BlockCapability): void => {
    const same = values.findIndex((entry) => capabilitySignature(entry) === capabilitySignature(capability));
    if (same >= 0) {
      if (values[same]?.evidence === 'inferred' && capability.evidence === 'verified') values[same] = capability;
      return;
    }
    values.push(capability);
  };

  for (const capability of input.explicit ?? []) {
    if (requiresVerifiedEvidence(capability) && capability.evidence !== 'verified') continue;
    add(capability);
  }
  addVisualCapability(input.visualClassification, input.visualClassificationEvidence, add);
  addBehaviorCapabilities(input.behavior, add);
  addStateCapabilities(input.stateDefinitions, add);
  if (input.stateDefinitions?.some((definition) => definition.name === 'waterlogged')) add({ kind: 'waterloggable', evidence: 'inferred' });
  validateCapabilityProfile(values);
  return Object.freeze(values.slice());
}

function addStateCapabilities(stateDefinitions: readonly BlockStateDefinition[] | undefined, add: (capability: BlockCapability) => void): void {
  const facing = stateDefinitions?.find((definition) => definition.name === 'facing');
  const values = new Set(facing?.values);
  const horizontal = ['north', 'east', 'south', 'west'].every((value) => values.has(value));
  const sixFace = ['down', 'up', 'north', 'south', 'west', 'east'].every((value) => values.has(value));
  if (sixFace) add({ kind: 'directional', mode: 'six-face', evidence: 'inferred' });
  else if (horizontal) add({ kind: 'directional', mode: 'horizontal', evidence: 'inferred' });

  const rotation = stateDefinitions?.find((definition) => definition.name === 'rotation');
  if (rotation?.values.length === 4 && rotation.values.every((value, index) => value === String(index))) add({ kind: 'rotatable', mode: 'four-step', evidence: 'inferred' });
  if (rotation?.values.length === 16 && rotation.values.every((value, index) => value === String(index))) add({ kind: 'rotatable', mode: 'sixteen-step', evidence: 'inferred' });
}

function addVisualCapability(classification: BlockVisualClassification | undefined, evidence: BlockCapabilityEvidence | undefined, add: (capability: BlockCapability) => void): void {
  if (classification === 'standard-json') add({ kind: 'standard-json-render', evidence: evidence ?? 'inferred' });
  if (classification === 'special-renderer-required') add({ kind: 'special-renderer', evidence: evidence ?? 'verified' });
  if (classification === 'intentionally-invisible') add({ kind: 'intentionally-invisible', evidence: evidence ?? 'verified' });
}

function addBehaviorCapabilities(behavior: BlockBehavior | undefined, add: (capability: BlockCapability) => void): void {
  if (!behavior) return;
  const verified = 'verified' as const;
  const directional = (mode: BlockDirectionMode): void => add({ kind: 'directional', mode, evidence: verified });
  const rotatable = (mode: BlockRotationMode): void => add({ kind: 'rotatable', mode, evidence: verified });
  const attachment = (...surfaces: BlockAttachmentSurface[]): void => add({ kind: 'attachment', surfaces: Object.freeze(surfaces.slice()), evidence: verified });
  const multiBlock = (mode: BlockMultiBlockMode): void => add({ kind: 'multi-block', mode, evidence: verified });
  const entity = (entityKind: BlockEntityKind): void => add({ kind: 'block-entity', entityKind, evidence: verified });

  switch (behavior.kind) {
    case 'horizontal-connect': add({ kind: 'neighbor-dependent', family: behavior.family, evidence: verified }); break;
    case 'stairs': directional('horizontal'); add({ kind: 'neighbor-dependent', family: 'stairs', evidence: verified }); break;
    case 'wall-mounted': directional('horizontal'); attachment('wall'); break;
    case 'wall-sign': directional('horizontal'); attachment('wall'); entity('sign'); break;
    case 'standing-sign': rotatable('sixteen-step'); attachment('floor'); entity('sign'); break;
    case 'hanging-sign': rotatable('sixteen-step'); attachment('ceiling', 'chain'); entity('sign'); break;
    case 'wall-hanging-sign': directional('horizontal'); attachment('wall'); entity('sign'); break;
    case 'floor-supported': attachment('floor'); break;
    case 'vertical-chain': attachment('chain'); break;
    case 'lantern-placement': attachment('floor', 'ceiling'); break;
    case 'torch-placement': attachment('floor', 'wall'); break;
    case 'double-height': multiBlock('double-height'); break;
    case 'paired-horizontal': directional('horizontal'); multiBlock('paired-horizontal'); break;
    case 'candle': break;
    case 'six-face-placement': directional('six-face'); break;
    case 'decorated-pot-placement': directional('horizontal'); entity('decorated-pot'); break;
    case 'conduit-placement': entity('conduit'); break;
    case 'fluid': add({ kind: 'fluid', fluid: behavior.fluid, evidence: verified }); break;
    case 'head-placement':
      if (behavior.wall) { directional('horizontal'); attachment('wall'); }
      else { rotatable('sixteen-step'); attachment('floor'); }
      break;
    case 'solid': break;
  }
}

function capabilitySignature(capability: BlockCapability): string {
  switch (capability.kind) {
    case 'directional': return `${capability.kind}:${capability.mode}`;
    case 'rotatable': return `${capability.kind}:${capability.mode}`;
    case 'attachment': return `${capability.kind}:${[...capability.surfaces].sort().join(',')}`;
    case 'neighbor-dependent': return `${capability.kind}:${capability.family ?? ''}`;
    case 'multi-block': return `${capability.kind}:${capability.mode}`;
    case 'block-entity': return `${capability.kind}:${capability.entityKind}`;
    case 'fluid': return `${capability.kind}:${capability.fluid}`;
    default: return capability.kind;
  }
}

function requiresVerifiedEvidence(capability: BlockCapability): boolean {
  return capability.kind === 'attachment' || capability.kind === 'multi-block' || capability.kind === 'block-entity';
}

export function validateCapabilityProfile(capabilities: BlockCapabilityProfile): void {
  const verifiedOnly = capabilities.find((capability) => (capability.kind === 'attachment' || capability.kind === 'multi-block' || capability.kind === 'block-entity') && capability.evidence !== 'verified');
  if (verifiedOnly) throw new Error(`Capability ${verifiedOnly.kind} requires verified evidence`);
  const directional = capabilities.filter((capability) => capability.kind === 'directional');
  if (new Set(directional.map((capability) => capability.mode)).size > 1) throw new Error('A block capability profile cannot contain conflicting directional modes');
  const entities = capabilities.filter((capability) => capability.kind === 'block-entity');
  if (new Set(entities.map((capability) => capability.entityKind)).size > 1) throw new Error('A block capability profile cannot contain conflicting block-entity kinds');
  const fluids = capabilities.filter((capability) => capability.kind === 'fluid');
  if (new Set(fluids.map((capability) => capability.fluid)).size > 1) throw new Error('A block capability profile cannot contain both water and lava');
  const renderKinds = capabilities.filter((capability) => capability.kind === 'standard-json-render' || capability.kind === 'special-renderer' || capability.kind === 'intentionally-invisible');
  if (new Set(renderKinds.map((capability) => capability.kind)).size > 1) throw new Error('A block capability profile cannot contain conflicting render classifications');
}

export function hasBlockCapability(source: BlockCapabilityProfile | Pick<BlockDefinition, 'capabilities'> | undefined, kind: BlockCapabilityKind): boolean {
  return capabilityList(source).some((capability) => capability.kind === kind);
}

export function blockCapability<TKind extends BlockCapabilityKind>(source: BlockCapabilityProfile | Pick<BlockDefinition, 'capabilities'> | undefined, kind: TKind): Extract<BlockCapability, { kind: TKind }> | undefined {
  return capabilityList(source).find((capability) => capability.kind === kind) as Extract<BlockCapability, { kind: TKind }> | undefined;
}

export function blockCapabilityConfidence(source: BlockCapabilityProfile | Pick<BlockDefinition, 'capabilities'> | undefined, kind: BlockCapabilityKind): BlockCapabilityEvidence | undefined {
  return blockCapability(source, kind)?.evidence;
}

export function addBlockCapability(profile: BlockCapabilityProfile | undefined, capability: BlockCapability): BlockCapabilityProfile {
  return deriveBlockCapabilities({ explicit: [...(profile ?? []), capability] });
}

export function blockCapabilityDiagnostics(input: BlockCapabilityDiagnosticInput): BlockCapabilityDiagnostics {
  const evidence = Object.fromEntries(input.capabilities.map((capability) => [capability.kind, capability.evidence])) as Readonly<Partial<Record<BlockCapabilityKind, BlockCapabilityEvidence>>>;
  return { ...input, evidence };
}

function capabilityList(source: BlockCapabilityProfile | Pick<BlockDefinition, 'capabilities'> | undefined): BlockCapabilityProfile {
  if (!source) return [];
  if (Array.isArray(source)) return source as BlockCapabilityProfile;
  return (source as Pick<BlockDefinition, 'capabilities'>).capabilities ?? [];
}
