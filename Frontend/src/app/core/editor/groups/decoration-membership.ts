import type { PlacedDecoration } from '../../decorations/decoration.types';
import type { ProjectDocument, ProjectGroup } from '../../domain/project.types';

export function decorationGroupIdsOf(decoration: PlacedDecoration): readonly string[] { return decoration.groupIds ?? []; }
export function decorationHasGroup(decoration: PlacedDecoration, groupId: string): boolean { return decorationGroupIdsOf(decoration).includes(groupId); }
export function addDecorationGroup(decoration: PlacedDecoration, groupId: string): PlacedDecoration { return decorationHasGroup(decoration, groupId) ? decoration : { ...decoration, groupIds: [...decorationGroupIdsOf(decoration), groupId] }; }
export function removeDecorationGroup(decoration: PlacedDecoration, groupId: string): PlacedDecoration { return decorationHasGroup(decoration, groupId) ? { ...decoration, groupIds: decorationGroupIdsOf(decoration).filter((id) => id !== groupId) } : decoration; }
export function isDecorationLocked(decoration: PlacedDecoration, groups: readonly ProjectGroup[]): boolean { return decorationGroupIdsOf(decoration).some((id) => groups.find((group) => group.id === id)?.locked === true); }
export function isDecorationVisible(decoration: PlacedDecoration, groups: readonly ProjectGroup[]): boolean { return !decorationGroupIdsOf(decoration).some((id) => groups.find((group) => group.id === id)?.visible === false); }
export function isDecorationInGroup(decoration: PlacedDecoration, groupId: string | undefined): boolean { return !!groupId && decorationHasGroup(decoration, groupId); }
export function decorationGroupNames(decoration: PlacedDecoration, project: ProjectDocument): readonly string[] { return decorationGroupIdsOf(decoration).map((id) => project.groups.find((group) => group.id === id)?.name).filter((name): name is string => !!name); }
