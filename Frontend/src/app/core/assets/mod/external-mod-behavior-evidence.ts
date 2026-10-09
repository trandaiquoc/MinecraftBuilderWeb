import { TagIndex } from '../../content/tag-index';

export interface ExternalTrustedBehaviorEvidence {
  readonly families: ReadonlyMap<string, readonly string[]>;
  readonly tags: ReadonlyMap<string, readonly string[]>;
}

export function buildExternalTrustedBehaviorEvidence(blockIds: ReadonlySet<string>, tags: TagIndex): ExternalTrustedBehaviorEvidence {
  const families = new Map<string, Set<string>>();
  const tagIds = new Map<string, Set<string>>();
  for (const contribution of tags.contributions('block')) {
    const family = familyForTagPath(contribution.id, contribution.path);
    for (const member of tags.get('block', contribution.id).members) {
      if (!member.present || !blockIds.has(member.id)) continue;
      const ids = tagIds.get(member.id) ?? new Set<string>();
      ids.add(contribution.id);
      tagIds.set(member.id, ids);
      if (family) {
        const values = families.get(member.id) ?? new Set<string>();
        values.add(family);
        families.set(member.id, values);
      }
    }
  }
  return {
    families: new Map([...families].map(([id, values]) => [id, [...values].sort()])),
    tags: new Map([...tagIds].map(([id, values]) => [id, [...values].sort()])),
  };
}

function familyForTagPath(id: string, path: string): string | undefined {
  if (/(?:^|[_/])fences?(?:\.json)?$/.test(path)) return 'fence';
  if (/(?:^|[_/])walls?(?:\.json)?$/.test(path)) return 'wall';
  if (/(?:^|[_/])stairs?(?:\.json)?$/.test(path)) return 'stairs';
  if (/(?:^|[_/])doors?(?:\.json)?$/.test(path)) return 'doors';
  if (/(?:^|[_/])beds?(?:\.json)?$/.test(path)) return 'beds';
  if (/(?:^|[_/])tall_flowers?(?:\.json)?$/.test(path)) return 'double-height';
  if (id === 'minecraft:standing_signs') return 'standing-sign';
  if (id === 'minecraft:wall_signs') return 'wall-sign';
  if (id === 'minecraft:ceiling_hanging_signs') return 'hanging-sign';
  if (id === 'minecraft:wall_hanging_signs') return 'wall-hanging-sign';
  return undefined;
}
