import { describe, expect, it, vi } from 'vitest';
import { placementFeedbackForHit, resolvePlacementPreview } from './viewport-hit-resolver';
import type { ProjectDocument } from '../../domain/project.types';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { planPlacement } from '../../block-behavior/placement/placement-plan';

const project = {
  size: { x: 8, y: 8, z: 8 },
  blocks: [],
  decorations: [],
} as unknown as ProjectDocument;
const active = { id: 'minecraft:stone', state: {}, support: 'full' } as unknown as ActiveBlock;

describe('resolvePlacementPreview', () => {
  it('does not invoke placement planning when preview is not requested', () => {
    const provider = vi.fn();
    const result = resolvePlacementPreview({
      requested: false,
      project,
      active,
      target: { x: 1, y: 1, z: 1 },
      provider,
    });
    expect(provider).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('returns valid, unknown and invalid placement statuses only for requested previews', () => {
    const valid = resolvePlacementPreview({
      requested: true,
      project,
      active,
      target: { x: 1, y: 1, z: 1 },
      provider: () =>
        ({
          blocks: [],
          request: { id: active.id, position: { x: 1, y: 1, z: 1 }, state: {} },
          validation: { status: 'valid', reason: 'ok', affectedPositions: [] },
        }) as never,
    });
    expect(valid.status).toBe('valid');
    const unknown = resolvePlacementPreview({
      requested: true,
      project,
      active: { ...active, support: 'unknown' },
      target: { x: 1, y: 1, z: 1 },
    });
    expect(unknown.status).toBe('unknown');
    const invalid = resolvePlacementPreview({
      requested: true,
      project,
      active,
      target: { x: -1, y: 1, z: 1 },
    });
    expect(invalid.status).toBe('invalid');
  });

  it('exposes one status source for placement and decoration feedback', () => {
    expect(placementFeedbackForHit({ placement: { status: 'valid' } }, false)).toEqual({
      status: 'valid',
    });
    expect(placementFeedbackForHit({ decorationPlan: { status: 'invalid' } }, true)).toEqual({
      status: 'invalid',
    });
    expect(placementFeedbackForHit({ placement: { status: 'valid' } }, true)).toBeUndefined();
  });

  it('keeps a known stone preview valid through the viewport provider boundary', () => {
    const activeService = new ActiveBlockService();
    const library = new BlockLibraryService(activeService);
    activeService.select(library.getItem('minecraft:stone')!);
    const result = resolvePlacementPreview({
      requested: true,
      project,
      active: activeService.active(),
      target: { x: 1, y: 1, z: 1 },
      provider: (currentProject, currentActive, target, context, lookup) =>
        planPlacement(
          currentProject,
          currentActive,
          target,
          context,
          (id) => library.get(id),
          library.getItem(currentActive.itemId ?? currentActive.id),
          lookup,
        ),
    });
    expect(result.status).toBe('valid');
    expect(result.plan?.request.kind).toBe('resolved');
  });
});
