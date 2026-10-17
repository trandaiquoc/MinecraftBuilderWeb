import type { ProjectSummary } from '../../../core/persistence/project-store/project-store.port';

export type ProjectScreenProjectOrder = 'newest' | 'oldest' | 'name';

export function isProjectScreenProjectOrder(value: string): value is ProjectScreenProjectOrder {
  return value === 'newest' || value === 'oldest' || value === 'name';
}

export function filterAndSortProjectSummaries(
  projects: readonly ProjectSummary[],
  query: string,
  order: ProjectScreenProjectOrder,
  locale: string,
): readonly ProjectSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const matchingProjects = normalizedQuery
    ? projects.filter((project) => projectSearchText(project, locale).includes(normalizedQuery))
    : projects;
  const sortedProjects = [...matchingProjects];

  if (order === 'name') {
    sortedProjects.sort(
      (left, right) =>
        collator.compare(left.name, right.name) || right.updatedAt.localeCompare(left.updatedAt),
    );
  } else {
    sortedProjects.sort((left, right) => {
      const dateOrder = left.updatedAt.localeCompare(right.updatedAt);
      const requestedDateOrder = order === 'newest' ? -dateOrder : dateOrder;
      return requestedDateOrder || collator.compare(left.name, right.name);
    });
  }

  return sortedProjects;
}

function projectSearchText(project: ProjectSummary, locale: string): string {
  return [
    project.name,
    project.minecraftVersion,
    project.structureMode,
    `${project.size.x} ${project.size.y} ${project.size.z}`,
    `${project.size.x}x${project.size.y}x${project.size.z}`,
  ]
    .join(' ')
    .toLocaleLowerCase(locale);
}
