import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import type { BlockDefinition } from '../../../../core/blocks/catalog/block-definition.types';
import { collectProjectIssues, filterProjectIssues } from './project-diagnostics-analysis';

const text = {
  missingContent: 'missing title',
  missingText: 'missing detail',
  unresolvedText: 'unresolved detail',
  visualSupport: 'visual title',
  behaviorSupport: 'behavior title',
  partialVisualText: 'partial visual',
  partialBehaviorText: 'partial behavior',
  assetProblem: 'asset title',
  assetUnavailableText: 'asset unavailable',
};

describe('project diagnostics analysis', () => {
  it('preserves classification and canonical block order before appending the asset warning', () => {
    const project = {
      blocks: [
        { id: 'missing', kind: 'missing' },
        { id: 'unresolved', kind: 'resolved' },
        { id: 'partial', kind: 'resolved' },
        { id: 'full', kind: 'resolved' },
      ],
    } as unknown as ProjectDocument;
    const partial = { visualSupport: 'partial', behaviorSupport: 'partial' } as BlockDefinition;
    const full = { visualSupport: 'real', behaviorSupport: 'full' } as BlockDefinition;
    const getDefinition = vi.fn((id: string) =>
      id === 'partial' ? partial : id === 'full' ? full : undefined,
    );

    const issues = collectProjectIssues(project, getDefinition, false, text);

    expect(issues).toEqual([
      { severity: 'error', title: 'missing title', detail: 'missing detail', id: 'missing' },
      {
        severity: 'error',
        title: 'missing title',
        detail: 'unresolved detail',
        id: 'unresolved',
      },
      {
        severity: 'warning',
        title: 'visual title',
        detail: 'partial visual',
        id: 'partial',
      },
      {
        severity: 'warning',
        title: 'behavior title',
        detail: 'partial behavior',
        id: 'partial',
      },
      { severity: 'warning', title: 'asset title', detail: 'asset unavailable' },
    ]);
    expect(getDefinition).toHaveBeenCalledTimes(project.blocks.length);
  });

  it('filters a collected report across localized text and IDs without recollecting blocks', () => {
    const project = {
      blocks: [
        { id: 'minecraft:missing_block', kind: 'missing' },
        { id: 'minecraft:stone', kind: 'resolved' },
      ],
    } as unknown as ProjectDocument;
    const getDefinition = vi.fn(() => undefined);
    const collected = collectProjectIssues(project, getDefinition, true, text);

    expect(filterProjectIssues(collected, 'STONE')).toEqual([collected[1]]);
    expect(filterProjectIssues(collected, 'missing detail')).toEqual([collected[0]]);
    expect(filterProjectIssues(collected, '  ')).toBe(collected);
    expect(getDefinition).toHaveBeenCalledTimes(project.blocks.length);
  });
});
