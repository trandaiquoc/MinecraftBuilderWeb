import * as THREE from 'three';
import { PlacedBlock } from '../../domain/project.types';
import {
  fluidCornerHeightsResolved,
  fluidVelocityResolved,
  FluidRenderResolver,
  FluidWorldLookup,
  vanillaFluidRenderResolver,
} from './fluid-state';
import { shouldCullFluidFace } from './fluid-face-occlusion';
import { fluidSideUv } from './fluid-surface-sampler';

export interface FluidGeometryResult {
  readonly geometry: THREE.BufferGeometry;
  readonly faceCount: number;
  readonly flowAngle: number;
}

export function createFluidGeometry(
  block: PlacedBlock,
  world?: FluidWorldLookup,
  resolver: FluidRenderResolver = vanillaFluidRenderResolver,
): FluidGeometryResult | undefined {
  const state = resolver.resolve(block, world);
  if (!state) return undefined;
  const lookup = world ?? {
    getBlock: (position: PlacedBlock['position']) =>
      position.x === block.position.x &&
      position.y === block.position.y &&
      position.z === block.position.z
        ? block
        : undefined,
  };
  const corners = fluidCornerHeightsResolved(block.position, state, lookup, resolver);
  const velocity = fluidVelocityResolved(block.position, state, lookup, resolver);
  const flowAngle =
    Math.hypot(velocity.x, velocity.z) > 1e-6
      ? Math.atan2(velocity.z, velocity.x) - Math.PI / 2
      : 0;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let faces = 0;
  const quad = (
    vertices: readonly (readonly [number, number, number])[],
    uv: readonly (readonly [number, number])[],
    flipWinding = false,
  ): void => {
    const start = faces * 4;
    vertices.forEach((vertex) => positions.push(...vertex));
    uv.forEach((value) => uvs.push(...value));
    indices.push(
      ...(flipWinding
        ? [start, start + 2, start + 1, start, start + 3, start + 2]
        : [start, start + 1, start + 2, start, start + 2, start + 3]),
    );
    faces++;
  };
  const hNW = corners.northWest - 0.001;
  const hNE = corners.northEast - 0.001;
  const hSW = corners.southWest - 0.001;
  const hSE = corners.southEast - 0.001;
  const topUv = rotateUv(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    flowAngle,
  );
  if (!shouldCullFluidFace(block.position, 'up', state, lookup, resolver))
    quad(
      [
        [0, hNW, 0],
        [1, hNE, 0],
        [1, hSE, 1],
        [0, hSW, 1],
      ],
      topUv,
      true,
    );
  if (!shouldCullFluidFace(block.position, 'down', state, lookup, resolver))
    quad(
      [
        [0, 0, 1],
        [1, 0, 1],
        [1, 0, 0],
        [0, 0, 0],
      ],
      [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
      true,
    );
  if (!shouldCullFluidFace(block.position, 'north', state, lookup, resolver))
    quad(
      [
        [0, 0, 0.001],
        [1, 0, 0.001],
        [1, hNE, 0.001],
        [0, hNW, 0.001],
      ],
      fluidSideUv(hNW, hNE),
      true,
    );
  if (!shouldCullFluidFace(block.position, 'south', state, lookup, resolver))
    quad(
      [
        [1, 0, 0.999],
        [0, 0, 0.999],
        [0, hSW, 0.999],
        [1, hSE, 0.999],
      ],
      fluidSideUv(hSE, hSW),
      true,
    );
  if (!shouldCullFluidFace(block.position, 'west', state, lookup, resolver))
    quad(
      [
        [0.001, 0, 0],
        [0.001, 0, 1],
        [0.001, hSW, 1],
        [0.001, hNW, 0],
      ],
      fluidSideUv(hSW, hNW),
    );
  if (!shouldCullFluidFace(block.position, 'east', state, lookup, resolver))
    quad(
      [
        [0.999, 0, 1],
        [0.999, 0, 0],
        [0.999, hNE, 0],
        [0.999, hSE, 1],
      ],
      fluidSideUv(hNE, hSE),
    );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, faceCount: faces, flowAngle };
}

function rotateUv(
  values: readonly (readonly [number, number])[],
  angle: number,
): readonly (readonly [number, number])[] {
  if (!angle) return values;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return values.map(([u, v]) => {
    const x = u - 0.5;
    const y = v - 0.5;
    return [0.5 + x * cos - y * sin, 0.5 + x * sin + y * cos];
  });
}
