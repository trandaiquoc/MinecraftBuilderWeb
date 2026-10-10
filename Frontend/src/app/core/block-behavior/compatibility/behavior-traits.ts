import type { BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import { GENERIC_BEHAVIOR_PROFILES } from './behavior-profiles';
import type { BehaviorFingerprint, BehaviorTrait } from './behavior-fingerprint';

const SIX_FACE_VALUES: readonly string[] =
  GENERIC_BEHAVIOR_PROFILES.attachedSixFace.requiredStates.facing;
const HORIZONTAL_VALUES: readonly string[] =
  GENERIC_BEHAVIOR_PROFILES.wallMounted.requiredStates.facing;
const BOOLEAN_VALUES: readonly string[] = GENERIC_BEHAVIOR_PROFILES.fence.requiredStates['north'];

export function inferBehaviorTraits(
  fingerprint: Omit<BehaviorFingerprint, 'traits'> | BehaviorFingerprint,
): readonly BehaviorTrait[] {
  const traits = new Set<BehaviorTrait>();
  const has = (name: string, values?: readonly string[]) => {
    const property = fingerprint.properties.find((entry) => entry.name === name);
    return !!property && (!values || values.every((value) => property.values.includes(value)));
  };
  const horizontalConnection = HORIZONTAL_VALUES.every((name) => has(name, BOOLEAN_VALUES));
  const wallState = wallSchema(fingerprint.properties) && hasWallResourceEvidence(fingerprint);
  const stairs =
    has('facing', HORIZONTAL_VALUES) &&
    has('half', ['top', 'bottom']) &&
    has('shape', ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right']);
  const sixFace = has('facing', SIX_FACE_VALUES);
  if (horizontalConnection || wallState) traits.add('horizontal-connection');
  if (wallState || stairs) traits.add('neighbor-derived-shape');
  if (sixFace) traits.add('six-face-orientation');
  if (sixFace && hasFaceAttachmentEvidence(fingerprint)) traits.add('face-attachment');
  if (has('waterlogged', BOOLEAN_VALUES)) traits.add('waterloggable');
  if (has('axis', ['x', 'y', 'z'])) traits.add('axis-orientation');
  if (
    fingerprint.supportContracts.some(
      (contract) => contract === 'floor' || contract === 'plantable-soil',
    ) ||
    fingerprint.supportRequirements.some((requirement) => requirement.startsWith('below:'))
  )
    traits.add('floor-support');
  if (
    fingerprint.supportContracts.some((contract) => contract === 'ceiling') ||
    fingerprint.supportRequirements.some((requirement) => requirement.startsWith('above:'))
  )
    traits.add('ceiling-support');
  if (fingerprint.capabilities.some((capability) => capability === 'block-entity'))
    traits.add('block-entity');
  if (
    fingerprint.capabilities.some(
      (capability) => capability === 'solid' || capability === 'support-provider',
    )
  )
    traits.add('solid-support-provider');
  return [...traits];
}

function hasFaceAttachmentEvidence(
  fingerprint: Omit<BehaviorFingerprint, 'traits'> | BehaviorFingerprint,
): boolean {
  if (fingerprint.supportContracts.includes('six-face-attachment')) return true;
  return (
    fingerprint.predicates.includes('facing') &&
    fingerprint.modelParents.some((parent) => parent.endsWith('block/cross')) &&
    SIX_FACE_VALUES.every((value) => fingerprint.predicates.includes(`facing:${value}`))
  );
}

export function hasWallResourceEvidence(
  fingerprint: Omit<BehaviorFingerprint, 'traits'> | BehaviorFingerprint,
): boolean {
  return (
    fingerprint.trustedFamilies.includes('wall') ||
    fingerprint.tags.some((tag) => /(?:^|:)walls$/.test(tag)) ||
    fingerprint.modelParents.some((parent) => parent.includes('template_wall_')) ||
    fingerprint.modelReferences.some((model) =>
      /(?:^|\/)(?:post|side|side_tall)$/.test(model.replace(/\.json$/, '')),
    ) ||
    (HORIZONTAL_VALUES.every((property) => fingerprint.predicates.includes(property)) &&
      fingerprint.modelReferences.length > 0)
  );
}

function wallSchema(definitions: readonly BlockStateDefinition[]): boolean {
  const expected: Readonly<Record<string, readonly string[]>> =
    GENERIC_BEHAVIOR_PROFILES.wall.requiredStates;
  return Object.entries(expected).every(([name, values]) => {
    const definition = definitions.find((entry) => entry.name === name);
    return !!definition && definition.values.every((value) => values.includes(value));
  });
}
