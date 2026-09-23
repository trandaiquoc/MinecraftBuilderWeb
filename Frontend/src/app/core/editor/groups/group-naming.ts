import type { ProjectGroup } from '../../domain/project.types';

export function normalizeGroupName(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase();
}

export function nextGroupId(groups: readonly ProjectGroup[]): string {
  let index = groups.length + 1;
  while (groups.some((group) => group.id === `group-${index}`)) index += 1;
  return `group-${index}`;
}

export function uniqueGroupName(seed: string, groups: readonly ProjectGroup[], fallback = 'Imported Structure'): string {
  const base = seed.trim() || fallback;
  let candidate = base;
  let suffix = 2;
  while (groups.some((group) => normalizeGroupName(group.name) === normalizeGroupName(candidate))) candidate = `${base} (${suffix++})`;
  return candidate;
}
