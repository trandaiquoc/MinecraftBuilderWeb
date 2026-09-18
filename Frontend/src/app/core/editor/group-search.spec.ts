import { describe, expect, it } from 'vitest';
import { ProjectGroup } from '../domain/project.types';
import { filterGroups } from './group-search';

const groups: readonly ProjectGroup[] = [
  { id: 'roof', name: 'Roof', visible: true, locked: false },
  { id: 'redstone', name: 'Redstone', visible: true, locked: true },
];

describe('group search', () => {
  it('returns all groups for an empty query', () => {
    expect(filterGroups(groups, '  ', { locked: 'Locked', unlocked: 'Unlocked' })).toEqual(groups);
  });

  it('matches group names case-insensitively', () => {
    expect(filterGroups(groups, 'roof', { locked: 'Locked', unlocked: 'Unlocked' }).map((group) => group.id)).toEqual(['roof']);
  });

  it('matches localized and canonical lock status labels', () => {
    expect(filterGroups(groups, 'Đã khóa', { locked: 'Đã khóa', unlocked: 'Mở khóa' }).map((group) => group.id)).toEqual(['redstone']);
    expect(filterGroups(groups, 'unlocked', { locked: 'Đã khóa', unlocked: 'Mở khóa' }).map((group) => group.id)).toEqual(['roof']);
  });

  it('returns an empty result without changing the source list', () => {
    expect(filterGroups(groups, 'missing', { locked: 'Locked', unlocked: 'Unlocked' })).toEqual([]);
    expect(groups).toHaveLength(2);
  });
});
