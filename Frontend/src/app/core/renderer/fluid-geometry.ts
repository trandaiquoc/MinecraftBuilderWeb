import * as THREE from 'three';
import { PlacedBlock } from '../domain/project.types';
import { fluidCornerHeights, fluidKindForBlockId, fluidStateForBlock, fluidVelocity, FluidWorldLookup } from './fluid-state';

export interface FluidGeometryResult { readonly geometry: THREE.BufferGeometry; readonly faceCount: number; readonly flowAngle: number; }

export function createFluidGeometry(block: PlacedBlock, world?: FluidWorldLookup): FluidGeometryResult | undefined {
  const state = fluidStateForBlock(block); if (!state) return undefined;
  const corners = fluidCornerHeights(block.position, state, world); const velocity = fluidVelocity(block.position, state, world);
  const flowAngle = velocity.x || velocity.z ? Math.atan2(velocity.z, velocity.x) - Math.PI / 2 : 0;
  const positions: number[] = []; const uvs: number[] = []; const indices: number[] = []; let faces = 0;
  const quad = (vertices: readonly (readonly [number, number, number])[], uv: readonly (readonly [number, number])[]): void => {
    const start = faces * 4; vertices.forEach((vertex) => positions.push(...vertex)); uv.forEach((value) => uvs.push(...value)); indices.push(start, start + 1, start + 2, start, start + 2, start + 3); faces++;
  };
  const hNW = corners.northWest - .001; const hNE = corners.northEast - .001; const hSW = corners.southWest - .001; const hSE = corners.southEast - .001;
  const topUv = rotateUv([[0, 0], [1, 0], [1, 1], [0, 1]], flowAngle);
  const same = (dx: number, dy: number, dz: number): boolean => fluidKindForBlockId(world?.getBlock({ x: block.position.x + dx, y: block.position.y + dy, z: block.position.z + dz })?.id ?? '') === state.kind;
  if (!same(0, 1, 0)) quad([[0, hNW, 0], [1, hNE, 0], [1, hSE, 1], [0, hSW, 1]], topUv);
  if (!same(0, -1, 0)) quad([[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  if (!same(0, 0, -1)) quad([[0, 0, .001], [1, 0, .001], [1, hNE, .001], [0, hNW, .001]], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  if (!same(0, 0, 1)) quad([[1, 0, .999], [0, 0, .999], [0, hSW, .999], [1, hSE, .999]], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  if (!same(-1, 0, 0)) quad([[.001, 0, 0], [.001, 0, 1], [.001, hSW, 1], [.001, hNW, 0]], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  if (!same(1, 0, 0)) quad([[.999, 0, 1], [.999, 0, 0], [.999, hNE, 0], [.999, hSE, 1]], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return { geometry, faceCount: faces, flowAngle };
}

function rotateUv(values: readonly (readonly [number, number])[], angle: number): readonly (readonly [number, number])[] {
  if (!angle) return values;
  const cos = Math.cos(angle); const sin = Math.sin(angle); return values.map(([u, v]) => { const x = u - .5; const y = v - .5; return [.5 + x * cos - y * sin, .5 + x * sin + y * cos]; });
}
