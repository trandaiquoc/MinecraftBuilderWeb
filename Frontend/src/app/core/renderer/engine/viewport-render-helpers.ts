import * as THREE from 'three';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import type { CameraPreset, CameraVector } from '../../editor/camera/camera';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import type { ResolvedBlockModel } from '../../blocks/resolver';

const INSTANCE_CHUNK_SIZE = 16;

type EmptyTransitionMesh = {
  readonly owner: string;
  readonly uuid: string;
  readonly worldPosition: unknown;
  readonly worldBounds: unknown;
};
type EmptyTransitionVisual = {
  readonly owner: string;
  readonly uuid: string;
  readonly position: unknown;
  readonly worldBounds: unknown;
};
type EmptyTransitionSnapshot<TMesh extends EmptyTransitionMesh, TVisual extends EmptyTransitionVisual> = {
  readonly ownership: {
    readonly visibleMeshCount: number;
    readonly renderedBlockCount: number;
  };
  readonly visibleMeshes: readonly TMesh[];
  readonly suspiciousVisuals: readonly TVisual[];
  readonly previewState: unknown;
  readonly activeBlock?: unknown;
};

export function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function blockRenderSignature(block: ProjectDocument['blocks'][number]): string {
  const state = Object.entries(block.state).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join(',');
  const entity = block.blockEntityData === undefined ? '' : `|entity=${stableValue(block.blockEntityData)}`;
  return `${block.kind}|${block.id}|${block.namespace}|${block.position.x},${block.position.y},${block.position.z}|${state}${entity}`;
}
export function compareEmptySnapshots<TMesh extends EmptyTransitionMesh, TVisual extends EmptyTransitionVisual>(firstEmpty: EmptyTransitionSnapshot<TMesh, TVisual>, secondEmpty: EmptyTransitionSnapshot<TMesh, TVisual>) {
  const key = (visual: TVisual): string => `${visual.owner}|${visual.uuid}|${stableValue(visual.position)}|${stableValue(visual.worldBounds)}`;
  const meshKey = (mesh: TMesh): string => `${mesh.owner}|${mesh.uuid}|${stableValue(mesh.worldPosition)}|${stableValue(mesh.worldBounds)}`;
  const firstMeshes = new Map(firstEmpty.visibleMeshes.map((mesh) => [meshKey(mesh), mesh]));
  const secondMeshes = new Map(secondEmpty.visibleMeshes.map((mesh) => [meshKey(mesh), mesh]));
  const firstVisuals = new Map(firstEmpty.suspiciousVisuals.map((visual) => [key(visual), visual]));
  const secondVisuals = new Map(secondEmpty.suspiciousVisuals.map((visual) => [key(visual), visual]));
  return {
    visibleMeshCountDelta: secondEmpty.ownership.visibleMeshCount - firstEmpty.ownership.visibleMeshCount,
    renderedBlockCountDelta: secondEmpty.ownership.renderedBlockCount - firstEmpty.ownership.renderedBlockCount,
    visibleMeshesAdded: [...secondMeshes].filter(([meshKeyValue]) => !firstMeshes.has(meshKeyValue)).map(([, mesh]) => mesh),
    visibleMeshesRemoved: [...firstMeshes].filter(([meshKeyValue]) => !secondMeshes.has(meshKeyValue)).map(([, mesh]) => mesh),
    suspiciousVisualsAdded: [...secondVisuals].filter(([visualKey]) => !firstVisuals.has(visualKey)).map(([, visual]) => visual),
    suspiciousVisualsRemoved: [...firstVisuals].filter(([visualKey]) => !secondVisuals.has(visualKey)).map(([, visual]) => visual),
    previewStateChanged: stableValue({ previewState: firstEmpty.previewState, activeBlock: firstEmpty.activeBlock }) !== stableValue({ previewState: secondEmpty.previewState, activeBlock: secondEmpty.activeBlock }),
  };
}
export function renderFilterKey(options: ViewportRenderOptions): string { const layerY = options.visibility ? undefined : options.layerY; return stableValue({ layerY, visibility: options.visibility, exposedFaceRendering: options.exposedFaceRendering === true }); }
export function isolateKey(options: ViewportRenderOptions): string { return stableValue({ isolatedGroupId: options.isolatedGroupId, isolatedGroupPositions: options.isolatedGroupPositions }); }
export function canonicalRenderOptions(options: ViewportRenderOptions): ViewportRenderOptions {
  if (options.isolatedGroupId === undefined && options.isolatedGroupPositions === undefined) return options;
  const { isolatedGroupId: _isolatedGroupId, isolatedGroupPositions: _isolatedGroupPositions, ...canonical } = options;
  return canonical;
}
export function surfaceNeighbor(position: VoxelCoordinate, direction: SurfaceFaceDirection): VoxelCoordinate {
  switch (direction) {
    case 'north': return { x: position.x, y: position.y, z: position.z - 1 };
    case 'south': return { x: position.x, y: position.y, z: position.z + 1 };
    case 'east': return { x: position.x + 1, y: position.y, z: position.z };
    case 'west': return { x: position.x - 1, y: position.y, z: position.z };
    case 'up': return { x: position.x, y: position.y + 1, z: position.z };
    case 'down': return { x: position.x, y: position.y - 1, z: position.z };
  }
}
export function isHorizontalDirection(value: string | undefined): value is 'north' | 'east' | 'south' | 'west' { return value === 'north' || value === 'east' || value === 'south' || value === 'west'; }
export function cameraMovementDirection(keys: ReadonlySet<string>, camera: THREE.Camera): THREE.Vector3 {
  const forward = camera.getWorldDirection(new THREE.Vector3()); forward.y = 0; if (forward.lengthSq() === 0) return new THREE.Vector3(); forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize(); const direction = new THREE.Vector3();
  if (keys.has('KeyW')) direction.add(forward); if (keys.has('KeyS')) direction.sub(forward); if (keys.has('KeyD')) direction.add(right); if (keys.has('KeyA')) direction.sub(right); if (keys.has('Space')) direction.y += 1; if (keys.has('ShiftLeft') || keys.has('ShiftRight')) direction.y -= 1;
  return direction;
}
export function cameraActionMovementDelta(actions: ReadonlySet<MovementAction>, camera: THREE.Camera, translationSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const direction = new THREE.Vector3(); const horizontal = new Set<string>();
  if (actions.has('move-forward')) horizontal.add('KeyW'); if (actions.has('move-backward')) horizontal.add('KeyS'); if (actions.has('move-left')) horizontal.add('KeyA'); if (actions.has('move-right')) horizontal.add('KeyD');
  const horizontalDirection = cameraMovementDirection(horizontal, camera);
  if (horizontalDirection.lengthSq()) direction.add(horizontalDirection.normalize().multiplyScalar(deltaSeconds * translationSpeed));
  if (actions.has('move-up')) direction.y += deltaSeconds * translationSpeed; if (actions.has('move-down')) direction.y -= deltaSeconds * translationSpeed;
  return direction;
}
export function cameraMovementDelta(keys: ReadonlySet<string>, camera: THREE.Camera, translationSpeed: number, _legacyVerticalSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const horizontalKeys = new Set([...keys].filter((key) => key === 'KeyW' || key === 'KeyA' || key === 'KeyS' || key === 'KeyD'));
  const direction = cameraMovementDirection(horizontalKeys, camera); if (direction.lengthSq()) direction.normalize().multiplyScalar(deltaSeconds * translationSpeed);
  direction.y += ((keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)) * deltaSeconds * translationSpeed; return direction;
}
export function blockCoordinateFromHit(hit: THREE.Intersection): VoxelCoordinate | undefined {
  const direct = hit.object.userData['voxel'] as VoxelCoordinate | undefined; if (direct) return direct;
  const instanceId = hit.instanceId; if (instanceId === undefined) return undefined;
  return (hit.object.userData['instanceVoxels'] as VoxelCoordinate[] | undefined)?.[instanceId];
}
export function surfaceFaceDirectionFromHit(hit: THREE.Intersection): SurfaceFaceDirection | undefined {
  if (hit.instanceId === undefined || hit.object.userData['surfaceFaceBatch'] !== true) return undefined;
  return (hit.object.userData['instanceFaceDirections'] as SurfaceFaceDirection[] | undefined)?.[hit.instanceId];
}
export function surfaceFaceNormal(direction: SurfaceFaceDirection): THREE.Vector3 {
  switch (direction) { case 'north': return new THREE.Vector3(0, 0, -1); case 'south': return new THREE.Vector3(0, 0, 1); case 'east': return new THREE.Vector3(1, 0, 0); case 'west': return new THREE.Vector3(-1, 0, 0); case 'up': return new THREE.Vector3(0, 1, 0); case 'down': return new THREE.Vector3(0, -1, 0); }
}
export function vectorValue(vector: THREE.Vector3): CameraVector { return { x: vector.x, y: vector.y, z: vector.z }; }
export function perspectiveDirection(): THREE.Vector3 { return new THREE.Vector3(1, .75, 1).normalize(); }
export function presetDirection(preset: CameraPreset): THREE.Vector3 { switch (preset) { case 'top': return new THREE.Vector3(0, 1, 0); case 'front': return new THREE.Vector3(0, 0, 1); case 'back': return new THREE.Vector3(0, 0, -1); case 'left': return new THREE.Vector3(-1, 0, 0); case 'right': return new THREE.Vector3(1, 0, 0); case 'perspective': return perspectiveDirection(); } }
export function createBoundedGrid(sizeX: number, sizeZ: number, color: number): THREE.LineSegments { const points: THREE.Vector3[] = []; for (let x = 0; x <= sizeX; x++) points.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 0, sizeZ)); for (let z = 0; z <= sizeZ; z++) points.push(new THREE.Vector3(0, 0, z), new THREE.Vector3(sizeX, 0, z)); return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .72 })); }
export const DETAILED_SELECTION_OUTLINE_LIMIT = 256;
export function sameVoxel(left: VoxelCoordinate | undefined, right: VoxelCoordinate | undefined): boolean { return left?.x === right?.x && left?.y === right?.y && left?.z === right?.z; }
export function boundsOfPositions(positions: readonly VoxelCoordinate[]): { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined { if (!positions.length) return undefined; let minX = positions[0].x; let minY = positions[0].y; let minZ = positions[0].z; let maxX = minX; let maxY = minY; let maxZ = minZ; for (let index = 1; index < positions.length; index += 1) { const position = positions[index]; minX = Math.min(minX, position.x); minY = Math.min(minY, position.y); minZ = Math.min(minZ, position.z); maxX = Math.max(maxX, position.x); maxY = Math.max(maxY, position.y); maxZ = Math.max(maxZ, position.z); } return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }; }
export function emptyResolvedModel(block: ProjectDocument['blocks'][number]): ResolvedBlockModel { return { blockId: block.id, state: block.state, parts: [], support: 'full', diagnostics: [], trace: { blockstateResource: '', matchedVariantKeys: [], selectedModelIds: [], modelResources: [], parentResources: [], elementCount: 0, faceCount: 0, textureResources: [] } }; }
export function unitVoxelEnvelope(): THREE.Box3 { return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)); }
export function stableChunkBounds(chunk: string, envelope: THREE.Box3): THREE.Box3 { const [chunkX, chunkY, chunkZ] = chunk.split(',').map(Number); const origin = new THREE.Vector3(chunkX * INSTANCE_CHUNK_SIZE, chunkY * INSTANCE_CHUNK_SIZE, chunkZ * INSTANCE_CHUNK_SIZE); return new THREE.Box3(origin.clone().add(envelope.min), origin.clone().add(new THREE.Vector3(INSTANCE_CHUNK_SIZE - 1, INSTANCE_CHUNK_SIZE - 1, INSTANCE_CHUNK_SIZE - 1)).add(envelope.max)); }
export function chunkKey(position: VoxelCoordinate): string { return `${Math.floor(position.x / INSTANCE_CHUNK_SIZE)},${Math.floor(position.y / INSTANCE_CHUNK_SIZE)},${Math.floor(position.z / INSTANCE_CHUNK_SIZE)}`; }
