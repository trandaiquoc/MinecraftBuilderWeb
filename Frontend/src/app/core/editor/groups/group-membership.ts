import { PlacedBlock, ProjectDocument, ProjectGroup } from '../../domain/project.types';

export function groupIdsOf(block: PlacedBlock): readonly string[] {
  return block.groupIds ?? (block.groupId ? [block.groupId] : []);
}

export function hasGroup(block: PlacedBlock, groupId: string): boolean {
  return groupIdsOf(block).includes(groupId);
}

export function addGroup(block: PlacedBlock, groupId: string): PlacedBlock {
  return hasGroup(block, groupId) ? block : { ...withoutLegacyGroupId(block), groupIds: [...groupIdsOf(block), groupId] };
}

export function removeGroup(block: PlacedBlock, groupId: string): PlacedBlock {
  return hasGroup(block, groupId) ? { ...withoutLegacyGroupId(block), groupIds: groupIdsOf(block).filter((id) => id !== groupId) } : block;
}

export function isBlockLocked(block: PlacedBlock, groups: readonly ProjectGroup[]): boolean {
  return groupIdsOf(block).some((id) => groups.find((group) => group.id === id)?.locked === true);
}

export function isBlockVisible(block: PlacedBlock, groups: readonly ProjectGroup[]): boolean {
  return !groupIdsOf(block).some((id) => groups.find((group) => group.id === id)?.visible === false);
}

export function blockGroupNames(block: PlacedBlock, project: ProjectDocument): readonly string[] {
  return groupIdsOf(block).map((id) => project.groups.find((group) => group.id === id)?.name).filter((name): name is string => !!name);
}

function withoutLegacyGroupId(block: PlacedBlock): Omit<PlacedBlock, 'groupId'> {
  const { groupId: _legacyGroupId, ...rest } = block;
  return rest;
}
