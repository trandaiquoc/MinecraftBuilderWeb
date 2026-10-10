import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { BedVisualProvider } from './bed-visual-provider';

const bedProvider = new BedVisualProvider();
const bed = (state: Record<string, string> = {}): PlacedBlock => ({
  kind: 'resolved',
  id: 'minecraft:red_bed',
  namespace: 'minecraft',
  position: { x: 0, y: 0, z: 0 },
  state,
});

describe('BedVisualProvider', () => {
  it('uses one data-driven vanilla descriptor for colors, parts, and facing', () => {
    expect(bedProvider.textureResource(bed())).toBe('minecraft:entity/bed/red');
    expect(bedProvider.textureResource({ ...bed(), id: 'minecraft:blue_bed' })).toBe(
      'minecraft:entity/bed/blue',
    );
    const head = bedProvider.create(bed({ part: 'head', facing: 'north' }));
    const foot = bedProvider.create(bed({ part: 'foot', facing: 'north' }));
    expect(head.userData['bedGeometry']).toBe('minecraft-java-bed-1.21.1-modelpart');
    expect(head.userData['bedWorldFootOffset']).toBe(0);
    expect(head.children.length).toBe(1);
    expect(foot.children.length).toBe(1);
  });

  it.each(['head', 'foot'] as const)(
    'keeps the exact Bed %s ModelPart vertices inside one local voxel for every facing',
    (part) => {
      for (const facing of ['north', 'east', 'south', 'west']) {
        const visual = bedProvider.create(bed({ part, facing }));
        visual.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(visual);
        expect(
          bounds.min.x,
          `${part}/${facing} min=${bounds.min.toArray()}`,
        ).toBeGreaterThanOrEqual(-0.000001);
        expect(
          bounds.min.y,
          `${part}/${facing} min=${bounds.min.toArray()}`,
        ).toBeGreaterThanOrEqual(-0.000001);
        expect(
          bounds.min.z,
          `${part}/${facing} min=${bounds.min.toArray()}`,
        ).toBeGreaterThanOrEqual(-0.000001);
        expect(bounds.max.x).toBeLessThanOrEqual(1.000001);
        expect(bounds.max.y).toBeCloseTo(0.5625, 5);
        expect(bounds.max.z, `${part}/${facing} max=${bounds.max.toArray()}`).toBeLessThanOrEqual(
          1.000001,
        );
        expect(bounds.min.y).toBeCloseTo(0, 5);
      }
    },
  );

  it('does not claim another namespace or an unverified bed color', () => {
    expect(bedProvider.matches({ ...bed(), id: 'other:red_bed', namespace: 'other' })).toBe(false);
    expect(bedProvider.matches({ ...bed(), id: 'minecraft:straw_bed' })).toBe(false);
  });
});
