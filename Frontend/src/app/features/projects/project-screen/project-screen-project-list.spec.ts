import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '../../../core/persistence/project-store/project-store.port';
import {
  filterAndSortProjectSummaries,
  isProjectScreenProjectOrder,
} from './project-screen-project-list';

const projects: readonly ProjectSummary[] = [
  {
    id: 'cabin',
    name: 'Lakeside Cabin',
    minecraftVersion: '1.21.1',
    size: { x: 16, y: 16, z: 16 },
    structureMode: 'vanilla-structure-block',
    updatedAt: '2026-10-15T10:00:00.000Z',
  },
  {
    id: 'garden',
    name: 'Cánh đồng',
    minecraftVersion: '1.20.4',
    size: { x: 48, y: 32, z: 48 },
    structureMode: 'huge-structure-blocks',
    updatedAt: '2026-10-16T10:00:00.000Z',
  },
  {
    id: 'tower',
    name: 'Tower 2',
    minecraftVersion: '1.21.1',
    size: { x: 24, y: 48, z: 24 },
    structureMode: 'vanilla-structure-block',
    updatedAt: '2026-10-14T10:00:00.000Z',
  },
];

describe('Project Screen project list', () => {
  it('filters summaries by localized name, Minecraft version, mode, and dimensions', () => {
    expect(
      filterAndSortProjectSummaries(projects, 'CÁNH', 'newest', 'vi').map(({ id }) => id),
    ).toEqual(['garden']);
    expect(
      filterAndSortProjectSummaries(projects, '1.20.4', 'newest', 'en').map(({ id }) => id),
    ).toEqual(['garden']);
    expect(
      filterAndSortProjectSummaries(projects, 'huge-structure-blocks', 'newest', 'en').map(
        ({ id }) => id,
      ),
    ).toEqual(['garden']);
    expect(
      filterAndSortProjectSummaries(projects, '48x32x48', 'newest', 'en').map(({ id }) => id),
    ).toEqual(['garden']);
  });

  it('orders projects by newest, oldest, or localized name without mutating the source list', () => {
    expect(filterAndSortProjectSummaries(projects, '', 'newest', 'en').map(({ id }) => id)).toEqual(
      ['garden', 'cabin', 'tower'],
    );
    expect(filterAndSortProjectSummaries(projects, '', 'oldest', 'en').map(({ id }) => id)).toEqual(
      ['tower', 'cabin', 'garden'],
    );
    expect(filterAndSortProjectSummaries(projects, '', 'name', 'en').map(({ id }) => id)).toEqual([
      'garden',
      'cabin',
      'tower',
    ]);
    expect(projects.map(({ id }) => id)).toEqual(['cabin', 'garden', 'tower']);
  });

  it('accepts only supported sort values from the native select', () => {
    expect(isProjectScreenProjectOrder('newest')).toBe(true);
    expect(isProjectScreenProjectOrder('oldest')).toBe(true);
    expect(isProjectScreenProjectOrder('name')).toBe(true);
    expect(isProjectScreenProjectOrder('random')).toBe(false);
  });
});
