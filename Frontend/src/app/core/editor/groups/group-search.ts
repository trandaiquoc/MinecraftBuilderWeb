import { ProjectGroup } from '../../domain/project.types';

export interface GroupSearchLabels {
  readonly locked: string;
  readonly unlocked: string;
}

export function filterGroups(groups: readonly ProjectGroup[], query: string, labels: GroupSearchLabels): readonly ProjectGroup[] {
  const term = normalizeSearch(query);
  if (!term) return groups;
  return groups.filter((group) => {
    const status = group.locked ? labels.locked : labels.unlocked;
    return [group.name, status, group.locked ? 'locked' : 'unlocked'].some((value) => normalizeSearch(value).includes(term));
  });
}

export function normalizeSearch(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}
