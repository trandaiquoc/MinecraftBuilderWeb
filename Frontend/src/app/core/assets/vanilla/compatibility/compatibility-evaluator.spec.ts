import { describe, expect, it } from 'vitest';
import { VanillaAssetProvider } from '../vanilla-asset-provider';
import { evaluateCompatibility } from './compatibility-evaluator';

describe('compatibility evaluator', () => {
  it('classifies common contracts and generic resources without a version gate', () => {
    const doorVariants: Record<string, unknown> = {};
    const states = [
      ['north', 'lower', 'left', 'false', 'false'], ['east', 'lower', 'left', 'false', 'false'],
      ['south', 'lower', 'left', 'false', 'false'], ['west', 'lower', 'left', 'false', 'false'],
      ['north', 'upper', 'left', 'false', 'false'], ['north', 'lower', 'right', 'false', 'false'],
      ['north', 'lower', 'left', 'true', 'false'], ['north', 'lower', 'left', 'false', 'true'],
    ];
    for (const [facing, half, hinge, open, powered] of states) doorVariants[`facing=${facing},half=${half},hinge=${hinge},open=${open},powered=${powered}`] = { model: 'example:block/door' };
    const provider = new VanillaAssetProvider('fixture', '26.3', {
      'assets/example/blockstates/door.json': {
        variants: doorVariants,
      },
      'assets/example/models/block/door.json': {
        textures: { all: 'example:block/door' },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }],
      },
      'assets/example/blockstates/stone.json': { variants: { '': { model: 'example:block/stone' } } },
      'assets/example/models/block/stone.json': {
        textures: { all: 'example:block/stone' },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }],
      },
    }, new Map([
      ['assets/example/textures/block/door.png', new Uint8Array([1])],
      ['assets/example/textures/block/stone.png', new Uint8Array([1])],
    ]));
    const report = evaluateCompatibility(provider);
    expect(report.minecraftVersion).toBe('26.3');
    expect(report.compatibleReused.some((entry) => entry.id === 'example:door')).toBe(true);
    expect(report.newGenericSupported.some((entry) => entry.id === 'example:stone')).toBe(true);
  });
});
