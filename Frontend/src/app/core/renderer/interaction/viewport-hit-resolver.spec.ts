import { describe, expect, it, vi } from 'vitest';
import { resolvePlacementPreview } from './viewport-hit-resolver';
import type { ProjectDocument } from '../../domain/project.types';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';

const project = { size: { x: 8, y: 8, z: 8 }, blocks: [], decorations: [] } as unknown as ProjectDocument;
const active = { id: 'minecraft:stone', state: {}, support: 'full' } as unknown as ActiveBlock;

describe('resolvePlacementPreview', () => {
  it('does not invoke placement planning when preview is not requested', () => {
    const provider = vi.fn();
    const result = resolvePlacementPreview({ requested: false, project, active, target: { x: 1, y: 1, z: 1 }, provider });
    expect(provider).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('returns valid, unknown and invalid placement statuses only for requested previews', () => {
    const valid = resolvePlacementPreview({ requested: true, project, active, target: { x: 1, y: 1, z: 1 }, provider: () => ({ blocks: [], request: { id: active.id, position: { x: 1, y: 1, z: 1 }, state: {} }, validation: { status: 'valid', reason: 'ok', affectedPositions: [] } } as never) });
    expect(valid.status).toBe('valid');
    const unknown = resolvePlacementPreview({ requested: true, project, active: { ...active, support: 'unknown' }, target: { x: 1, y: 1, z: 1 } });
    expect(unknown.status).toBe('unknown');
    const invalid = resolvePlacementPreview({ requested: true, project, active, target: { x: -1, y: 1, z: 1 } });
    expect(invalid.status).toBe('invalid');
  });
});
