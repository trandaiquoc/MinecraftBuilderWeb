import { ALL_CONTENT_SOURCE } from '../../../core/content/source-selection/content-source-selection';
import type { ContentSourceOption } from './content-source-selector.component';

export function sourceOptions(
  options: readonly ContentSourceOption[],
  allCount: number,
  allLabel: string,
  allTooltip?: string,
): readonly ContentSourceOption[] {
  const all: ContentSourceOption = {
    id: ALL_CONTENT_SOURCE,
    label: allLabel,
    count: allCount,
    ...(allTooltip ? { tooltip: allTooltip } : {}),
  };
  const concrete = options.filter((option) => option.id !== ALL_CONTENT_SOURCE);
  return [
    all,
    ...concrete.sort((left, right) =>
      left.id === 'vanilla'
        ? -1
        : right.id === 'vanilla'
          ? 1
          : left.label.localeCompare(right.label),
    ),
  ];
}
