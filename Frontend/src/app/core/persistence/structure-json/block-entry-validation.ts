import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { materializeBlockState } from '../../blocks/catalog/block-state-compatibility';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item.types';
import { canonicalPlaceableItemId } from '../../blocks/placement-palette/placeable-item-resolution';
import { isWithinBounds } from '../../domain/coordinates';
import type { ProjectSize } from '../../domain/project.types';
import { validateStructureJsonBlockEntity } from './structure-json';
import type { StructureJsonBlock } from './structure-json';
import type {
  NormalizedValidationContentLimits,
  StructureJsonIssueCategory,
  StructureJsonIssueReason,
  StructureJsonValidationOptions,
  MutableStructureJsonIssues,
} from './structure-json-validation.types';
export { normalizeValidationContentLimits } from './structure-json-content-limits';

export function validateBlockEntry(
  issues: MutableStructureJsonIssues,
  block: StructureJsonBlock,
  index: number,
  size: ProjectSize,
  getDefinition: (id: string) => BlockDefinition | undefined,
  duplicateIndexes: ReadonlySet<number>,
  contentLimits: NormalizedValidationContentLimits,
  placeableItems: readonly PlaceableItemDefinition[] | undefined,
  resolveMaxStackSize: ((id: string) => number | undefined) | undefined,
): number {
  const position = { x: block.x, y: block.y, z: block.z };
  const inBounds = isWithinBounds(position, size);
  if (!inBounds) issues.bounds.push(issue('bounds', index, block, { code: 'out-of-bounds' }));
  const definition = getDefinition(block.id);
  appendContentLimitIssues(issues, index, block, contentLimits, placeableItems);
  if (!definition) {
    issues.missing.push(issue('missing', index, block, { code: 'missing-block' }));
    if (block.blockEntity)
      issues.state.push(
        issue('state', index, block, { code: 'invalid-block-entity', detail: 'missing-host' }),
      );
    return 0;
  }
  const invalid = findInvalidState(block, definition);
  const entityError = block.blockEntity
    ? validateStructureJsonBlockEntity(block.blockEntity, block.id, definition, resolveMaxStackSize)
    : undefined;
  if (invalid)
    issues.state.push({
      ...issue('state', index, block, invalid.reason),
      property: invalid.property,
      value: invalid.value,
    });
  else if (entityError)
    issues.state.push(
      issue('state', index, block, { code: 'invalid-block-entity', detail: entityError }),
    );
  else if (inBounds && !duplicateIndexes.has(index)) return 1;
  return 0;
}

export function issue(
  category: StructureJsonIssueCategory,
  index: number,
  block: StructureJsonBlock,
  reason: StructureJsonIssueReason,
) {
  return {
    category,
    index,
    id: block.id,
    position: { x: block.x, y: block.y, z: block.z },
    reason,
  };
}

function findInvalidState(
  block: StructureJsonBlock,
  definition: BlockDefinition,
):
  | { readonly property: string; readonly value: string; readonly reason: StructureJsonIssueReason }
  | undefined {
  const result = materializeBlockState(definition, block.state);
  if (result.valid) return undefined;
  return {
    property: result.issue.property,
    value: result.issue.value,
    reason:
      result.issue.code === 'unknown-state-property'
        ? { code: result.issue.code, property: result.issue.property }
        : { code: result.issue.code, property: result.issue.property, value: result.issue.value },
  };
}

function appendContentLimitIssues(
  issues: MutableStructureJsonIssues,
  index: number,
  block: StructureJsonBlock,
  limits: NormalizedValidationContentLimits,
  placeableItems?: readonly PlaceableItemDefinition[],
): void {
  if (!limits.enabled) return;
  const logicalId = canonicalPlaceableItemId(block.id, placeableItems);
  if (limits.blocks.has(logicalId))
    issues.contentLimit.push(
      issue('content-limit', index, block, {
        code: 'content-limit',
        restrictedId: logicalId,
        path: 'id',
      }),
    );
  const entity = block.blockEntity;
  if (!entity || entity.kind === 'sign') return;
  const items =
    entity.kind === 'container'
      ? entity.items.map((entry) => ({
          id: entry.item.id,
          path: `blockEntity.items[${entry.slot}].item.id`,
        }))
      : entity.kind === 'decorated-pot' && entity.item
        ? [{ id: entity.item.id, path: 'blockEntity.item.id' }]
        : [];
  for (const item of items)
    if (limits.items.has(item.id))
      issues.contentLimit.push(
        issue('content-limit', index, block, {
          code: 'content-limit',
          restrictedId: item.id,
          path: item.path,
        }),
      );
}
