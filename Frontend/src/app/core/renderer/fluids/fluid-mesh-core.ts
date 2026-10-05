import { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { fluidCornerHeightsResolved, fluidVelocityResolved, FluidRenderResolver, FluidWorldLookup, ResolvedFluidRenderState } from './fluid-state';
import { shouldCullFluidFace } from './fluid-face-occlusion';
import { fluidSideUv } from './fluid-surface-sampler';

export interface FluidMeshRecord { readonly block: PlacedBlock; readonly state: ResolvedFluidRenderState; }
export interface FluidMeshBucket {
  readonly materialKey: string;
  readonly fluidTypeId: string;
  readonly renderLayer: ResolvedFluidRenderState['renderLayer'];
  readonly texture: string;
  readonly tint?: number;
  readonly opacity?: number;
  readonly doubleSided: boolean;
  readonly depthWrite: boolean;
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
  readonly voxelKeys: string[];
  facesPotential: number;
  facesCulled: number;
  facesEmitted: number;
}
export interface FluidMeshBuildResult {
  readonly buckets: readonly FluidMeshBucket[];
  readonly fluidLogicalVoxels: number;
  readonly fluidFacesPotential: number;
  readonly fluidFacesCulled: number;
  readonly fluidFacesEmitted: number;
}

export function buildFluidMeshData(records: readonly FluidMeshRecord[], world: FluidWorldLookup, resolver: FluidRenderResolver): FluidMeshBuildResult {
  const buckets = new Map<string, FluidMeshBucket>();
  let potential = 0; let culled = 0; let emitted = 0;
  for (const record of records) {
    const { block, state } = record;
    const velocity = fluidVelocityResolved(block.position, state, world, resolver);
    const flowAngle = Math.hypot(velocity.x, velocity.z) > 1e-6 ? Math.atan2(velocity.z, velocity.x) - Math.PI / 2 : 0;
    const flowing = Math.hypot(velocity.x, velocity.z) > 1e-6;
    const texture = flowing ? state.flowTexture : state.stillTexture;
    const bucketKey = `${state.materialKey}|${state.renderLayer}|${texture}|${state.tint ?? ''}|${state.opacity ?? ''}|${state.depthWrite}|${state.doubleSided}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { materialKey: state.materialKey, fluidTypeId: state.fluidTypeId, renderLayer: state.renderLayer, texture, tint: state.tint, opacity: state.opacity, doubleSided: state.doubleSided, depthWrite: state.depthWrite, positions: [], normals: [], uvs: [], indices: [], voxelKeys: [], facesPotential: 0, facesCulled: 0, facesEmitted: 0 };
      buckets.set(bucketKey, bucket);
    }
    const corners = fluidCornerHeightsResolved(block.position, state, world, resolver);
    const hNW = corners.northWest - .001; const hNE = corners.northEast - .001; const hSW = corners.southWest - .001; const hSE = corners.southEast - .001;
    const topUv = rotateUv([[0, 0], [1, 0], [1, 1], [0, 1]], flowAngle);
    const key = `${block.position.x},${block.position.y},${block.position.z}`;
    const face = (vertices: readonly (readonly [number, number, number])[], uv: readonly (readonly [number, number])[], normal: readonly [number, number, number], flipWinding = false): void => {
      const start = bucket!.positions.length / 3;
      for (const [x, y, z] of vertices) { bucket!.positions.push(x, y, z); bucket!.normals.push(...normal); }
      for (const value of uv) bucket!.uvs.push(...value);
      bucket!.indices.push(...(flipWinding ? [start, start + 2, start + 1, start, start + 3, start + 2] : [start, start + 1, start + 2, start, start + 2, start + 3]));
      bucket!.voxelKeys.push(key); bucket!.facesEmitted += 1; emitted += 1;
    };
    const exposed = (dx: number, dy: number, dz: number, vertices: readonly (readonly [number, number, number])[], uv: readonly (readonly [number, number])[], normal: readonly [number, number, number], flip = false): void => {
      potential += 1; bucket!.facesPotential += 1;
      const direction = dx === 0 && dy === 1 ? 'up' : dx === 0 && dy === -1 ? 'down' : dx === 0 && dz === -1 ? 'north' : dx === 0 && dz === 1 ? 'south' : dx === -1 ? 'west' : 'east';
      if (shouldCullFluidFace(block.position, direction, state, world, resolver)) { culled += 1; bucket!.facesCulled += 1; return; }
      face(vertices, uv, normal, flip);
    };
    exposed(0, 1, 0, [[block.position.x, block.position.y + hNW, block.position.z], [block.position.x + 1, block.position.y + hNE, block.position.z], [block.position.x + 1, block.position.y + hSE, block.position.z + 1], [block.position.x, block.position.y + hSW, block.position.z + 1]], topUv, [0, 1, 0], true);
    exposed(0, -1, 0, [[block.position.x, block.position.y, block.position.z + 1], [block.position.x + 1, block.position.y, block.position.z + 1], [block.position.x + 1, block.position.y, block.position.z], [block.position.x, block.position.y, block.position.z]], [[0, 1], [1, 1], [1, 0], [0, 0]], [0, -1, 0], true);
    exposed(0, 0, -1, [[block.position.x, block.position.y, block.position.z + .001], [block.position.x + 1, block.position.y, block.position.z + .001], [block.position.x + 1, block.position.y + hNE, block.position.z + .001], [block.position.x, block.position.y + hNW, block.position.z + .001]], fluidSideUv(hNW, hNE), [0, 0, -1], true);
    exposed(0, 0, 1, [[block.position.x + 1, block.position.y, block.position.z + .999], [block.position.x, block.position.y, block.position.z + .999], [block.position.x, block.position.y + hSW, block.position.z + .999], [block.position.x + 1, block.position.y + hSE, block.position.z + .999]], fluidSideUv(hSE, hSW), [0, 0, 1], true);
    exposed(-1, 0, 0, [[block.position.x + .001, block.position.y, block.position.z], [block.position.x + .001, block.position.y, block.position.z + 1], [block.position.x + .001, block.position.y + hSW, block.position.z + 1], [block.position.x + .001, block.position.y + hNW, block.position.z]], fluidSideUv(hSW, hNW), [-1, 0, 0]);
    exposed(1, 0, 0, [[block.position.x + .999, block.position.y, block.position.z + 1], [block.position.x + .999, block.position.y, block.position.z], [block.position.x + .999, block.position.y + hNE, block.position.z], [block.position.x + .999, block.position.y + hSE, block.position.z + 1]], fluidSideUv(hNE, hSE), [1, 0, 0]);
  }
  return { buckets: [...buckets.values()], fluidLogicalVoxels: records.length, fluidFacesPotential: potential, fluidFacesCulled: culled, fluidFacesEmitted: emitted };
}

/** Keeps a failed fluid build visible and terminal without content-specific IDs. */
export function buildFluidFallbackMeshData(records: readonly FluidMeshRecord[]): FluidMeshBuildResult {
  const bucket: FluidMeshBucket = {
    materialKey: 'fluid-fallback',
    fluidTypeId: 'fallback',
    renderLayer: records[0]?.state.renderLayer ?? 'translucent',
    texture: '',
    tint: records[0]?.state.tint,
    opacity: .62,
    doubleSided: true,
    depthWrite: false,
    positions: [], normals: [], uvs: [], indices: [], voxelKeys: [],
    facesPotential: records.length * 6,
    facesCulled: 0,
    facesEmitted: records.length * 6,
  };
  const face = (vertices: readonly (readonly [number, number, number])[], normal: readonly [number, number, number], key: string): void => {
    const start = bucket.positions.length / 3;
    for (const [x, y, z] of vertices) { bucket.positions.push(x, y, z); bucket.normals.push(...normal); }
    bucket.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    bucket.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    bucket.voxelKeys.push(key);
  };
  for (const record of records) {
    const { x, y, z } = record.block.position;
    const key = `${x},${y},${z}`;
    face([[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]], [0, 1, 0], key);
    face([[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [x, y, z]], [0, -1, 0], key);
    face([[x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z]], [0, 0, -1], key);
    face([[x + 1, y, z + 1], [x, y, z + 1], [x, y + 1, z + 1], [x + 1, y + 1, z + 1]], [0, 0, 1], key);
    face([[x, y, z + 1], [x, y, z], [x, y + 1, z], [x, y + 1, z + 1]], [-1, 0, 0], key);
    face([[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]], [1, 0, 0], key);
  }
  return { buckets: [bucket], fluidLogicalVoxels: records.length, fluidFacesPotential: bucket.facesPotential, fluidFacesCulled: 0, fluidFacesEmitted: bucket.facesEmitted };
}

function rotateUv(values: readonly (readonly [number, number])[], angle: number): readonly (readonly [number, number])[] {
  if (!angle) return values;
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  return values.map(([u, v]) => { const x = u - .5; const y = v - .5; return [.5 + x * cos - y * sin, .5 + x * sin + y * cos]; });
}

export function fluidChunkKey(position: VoxelCoordinate, size = 16): string { return `${Math.floor(position.x / size)},${Math.floor(position.y / size)},${Math.floor(position.z / size)}`; }
