import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FluidChunkRenderer } from './fluid-chunk-renderer';
import { vanillaFluidRenderResolver, type FluidWorldLookup } from './fluid-state';
import { PlacedBlock } from '../../domain/project.types';

const block = (id: string, position: { x: number; y: number; z: number }): PlacedBlock => ({ kind: 'resolved', id, namespace: id.split(':')[0], position, state: { level: '0' } });
const worldFor = (blocks: readonly PlacedBlock[]): FluidWorldLookup => { const map = new Map(blocks.map((value) => [`${value.position.x},${value.position.y},${value.position.z}`, value])); return { getBlock: (position) => map.get(`${position.x},${position.y},${position.z}`) }; };

describe('FluidChunkRenderer', () => {
  it('uses bounded chunk meshes and keeps logical ownership', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    renderer.setProvider({ resolver: vanillaFluidRenderResolver, texture: async () => texture });
    const blocks = [block('minecraft:water', { x: 0, y: 0, z: 0 }), block('minecraft:water', { x: 1, y: 0, z: 0 }), block('minecraft:water', { x: 16, y: 0, z: 0 })];
    const records = blocks.map((value) => ({ block: value, state: vanillaFluidRenderResolver.resolve(value)! }));
    await renderer.sync(records, worldFor(blocks));
    expect(renderer.diagnostics()).toMatchObject({ fluidLogicalVoxels: 3, fluidChunks: 2, fluidStandaloneMeshes: 0 });
    expect(renderer.objectsForVoxel('0,0,0').length).toBeGreaterThan(0);
    expect(group.children).toHaveLength(1);
    renderer.dispose();
    expect(group.children).toHaveLength(0);
  });

  it('rebuilds only the dirty chunk neighborhood for a local edit', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    renderer.setProvider({ resolver: vanillaFluidRenderResolver, texture: async () => texture });
    const first = block('minecraft:water', { x: 0, y: 0, z: 0 }); await renderer.sync([{ block: first, state: vanillaFluidRenderResolver.resolve(first)! }], worldFor([first]));
    const second = block('minecraft:water', { x: 1, y: 0, z: 0 }); await renderer.sync([{ block: first, state: vanillaFluidRenderResolver.resolve(first)! }, { block: second, state: vanillaFluidRenderResolver.resolve(second)! }], worldFor([first, second]), [second.position]);
    expect(renderer.diagnostics().fluidIncrementalRebuilds).toBe(1);
    expect(renderer.objectsForVoxel('1,0,0').length).toBeGreaterThan(0);
  });
});
