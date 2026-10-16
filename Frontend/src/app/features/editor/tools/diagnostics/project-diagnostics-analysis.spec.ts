import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import type { BlockDefinition } from '../../../../core/blocks/catalog/block-definition.types';
import {
  collectProjectIssues,
  filterProjectIssues,
  localizeProjectIssues,
} from './project-diagnostics-analysis';

const text = {
  missingContent: 'missing title',
  missingText: 'missing detail',
  unresolvedText: 'unresolved detail',
  partialVisualTitle: 'partial visual title',
  partialVisualText: 'partial visual detail',
  fallbackVisualTitle: 'fallback visual title',
  fallbackVisualText: 'fallback visual detail',
  partialBehaviorTitle: 'partial behavior title',
  partialBehaviorText: 'partial behavior detail',
  unknownBehaviorTitle: 'unknown behavior title',
  unknownBehaviorText: 'unknown behavior detail',
  assetProblem: 'asset title',
  assetUnavailableText: 'asset unavailable',
};

const definition = (
  visualSupport: BlockDefinition['visualSupport'],
  behaviorSupport: BlockDefinition['behaviorSupport'],
) => ({ visualSupport, behaviorSupport }) as BlockDefinition;

describe('project diagnostics analysis', () => {
  it('groups equivalent block findings by canonical ID and counts affected instances', () => {
    const project = {
      blocks: [
        { id: 'minecraft:oak_leaves', kind: 'resolved' },
        { id: 'minecraft:oak_leaves', kind: 'resolved' },
        { id: 'minecraft:oak_leaves', kind: 'resolved' },
        { id: 'example:custom_leaves', kind: 'resolved' },
      ],
    } as unknown as ProjectDocument;
    const definitions = new Map([
      ['minecraft:oak_leaves', definition('partial', 'unknown')],
      ['example:custom_leaves', definition('partial', 'unknown')],
    ]);
    const getDefinition = vi.fn((id: string) => definitions.get(id));

    const issues = collectProjectIssues(project, getDefinition, true);

    expect(issues.map(({ code, id, affectedBlocks }) => [code, id, affectedBlocks])).toEqual([
      ['visual-support-partial', 'minecraft:oak_leaves', 3],
      ['visual-support-partial', 'example:custom_leaves', 1],
      ['behavior-support-unknown', 'minecraft:oak_leaves', 3],
      ['behavior-support-unknown', 'example:custom_leaves', 1],
    ]);
    expect(issues[0].key).not.toBe(issues[2].key);
    expect(issues[1].key).not.toBe(issues[0].key);
    expect(getDefinition).toHaveBeenCalledTimes(2);
  });

  it('keeps distinct semantic findings separate even when an ID or translated text matches', () => {
    const project = {
      blocks: [
        { id: 'example:unknown', kind: 'missing' },
        { id: 'example:unknown', kind: 'resolved' },
        { id: 'example:partial', kind: 'resolved' },
        { id: 'example:fallback', kind: 'resolved' },
      ],
    } as unknown as ProjectDocument;
    const definitions = new Map([
      ['example:partial', definition('partial', 'partial')],
      ['example:fallback', definition('fallback', 'full')],
    ]);
    const getDefinition = vi.fn((id: string) => definitions.get(id));

    const issues = collectProjectIssues(project, getDefinition, false);

    expect(issues.map((issue) => issue.code)).toEqual([
      'missing-content',
      'unresolved-content',
      'visual-support-partial',
      'behavior-support-partial',
      'visual-support-fallback',
      'assets-unavailable',
    ]);
    expect(issues[0].id).toBe(issues[1].id);
    expect(issues[0].key).not.toBe(issues[1].key);
    expect(issues[2].key).not.toBe(issues[3].key);
    expect(issues[2].key).not.toBe(issues[4].key);
    expect(issues[5].affectedBlocks).toBe(0);
    expect(getDefinition).toHaveBeenCalledTimes(3);
  });

  it('filters grouped issues by localized text, block ID, severity, and category', () => {
    const project = {
      blocks: [
        { id: 'example:missing_block', kind: 'missing' },
        { id: 'example:partial_leaves', kind: 'resolved' },
      ],
    } as unknown as ProjectDocument;
    const getDefinition = vi.fn((id: string) =>
      id === 'example:partial_leaves' ? definition('partial', 'partial') : undefined,
    );
    const collected = localizeProjectIssues(
      collectProjectIssues(project, getDefinition, true),
      text,
    );

    expect(filterProjectIssues(collected, 'PARTIAL')).toHaveLength(2);
    expect(filterProjectIssues(collected, 'example:missing')).toEqual([collected[0]]);
    expect(filterProjectIssues(collected, '', 'error')).toEqual([collected[0]]);
    expect(filterProjectIssues(collected, '', 'warning', 'behavior')).toEqual([collected[2]]);
    expect(filterProjectIssues(collected, '  ')).toBe(collected);
    expect(getDefinition).toHaveBeenCalledTimes(1);
  });

  it('keeps trapped chest behavior unverified and informational', () => {
    const project = {
      blocks: [{ id: 'minecraft:trapped_chest', kind: 'resolved' }],
    } as unknown as ProjectDocument;

    const issues = collectProjectIssues(project, () => definition('real', 'unknown'), true);

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'behavior-support-unknown',
        category: 'behavior',
        severity: 'info',
        id: 'minecraft:trapped_chest',
        affectedBlocks: 1,
      }),
    ]);
  });
});
