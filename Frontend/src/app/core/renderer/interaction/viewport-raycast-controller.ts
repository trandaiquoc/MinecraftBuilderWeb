import * as THREE from 'three';
import type { FaceNormal } from '../../editor/placement/placement';
import type { ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { ddaVoxelCandidates, type VoxelRaycastCandidate } from './voxel-raycast';

export interface ViewportRayHit {
  readonly position: VoxelCoordinate;
  readonly normal: FaceNormal;
  readonly point: THREE.Vector3;
  readonly distance: number;
}

export function fluidCoordinateFromHit(
  hit: THREE.Intersection,
  ownsVoxel: (key: string) => boolean,
): VoxelCoordinate | undefined {
  if (hit.object.userData['fluidChunk'] !== true) return undefined;
  const normal =
    hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).normalize() ??
    new THREE.Vector3();
  const point = hit.point.clone().sub(normal.multiplyScalar(0.002));
  const candidate = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
  return ownsVoxel(coordinateKey(candidate)) ? candidate : undefined;
}
export interface ViewportRaycastCallbacks {
  readonly classify: (position: VoxelCoordinate) => 'skip' | 'hit' | 'fallback';
  readonly objectsForVoxel: (position: VoxelCoordinate) => readonly THREE.Object3D[];
  readonly isPreciseHit: (hit: THREE.Intersection, position: VoxelCoordinate) => boolean;
  readonly record: (
    name: 'ddaPickCount' | 'precisePickFallbacks' | 'ddaVisitedVoxels' | 'ddaFullCubeHits',
    value?: number,
  ) => void;
}

/** Owns the bounded DDA fast path; precise ownership resolution stays in the facade port. */
export class ViewportRaycastController {
  constructor(
    private readonly raycaster: THREE.Raycaster,
    private readonly callbacks: ViewportRaycastCallbacks,
  ) {}

  pick(ray: THREE.Ray, size: ProjectSize): ViewportRayHit | undefined {
    this.callbacks.record('ddaPickCount');
    const result = ddaVoxelCandidates(
      { origin: ray.origin, direction: ray.direction },
      size,
      this.callbacks.classify,
    );
    if (!result) return undefined;
    this.callbacks.record('ddaVisitedVoxels', result.visitedVoxels);
    if (result.candidates.length) {
      this.callbacks.record('precisePickFallbacks');
      const precise = this.preciseCandidates(result.candidates);
      if (precise) return precise;
    }
    if (!result.fullCubeHit) return undefined;
    this.callbacks.record('ddaFullCubeHits');
    return {
      position: result.fullCubeHit.position,
      normal: result.fullCubeHit.normal,
      point: new THREE.Vector3(
        result.fullCubeHit.point.x,
        result.fullCubeHit.point.y,
        result.fullCubeHit.point.z,
      ),
      distance: result.fullCubeHit.distance,
    };
  }

  private preciseCandidates(
    candidates: readonly VoxelRaycastCandidate[],
  ): ViewportRayHit | undefined {
    for (const candidate of candidates) {
      const objects = this.callbacks.objectsForVoxel(candidate.position);
      const intersection = objects.length
        ? this.raycaster
            .intersectObjects([...objects], true)
            .find((hit) => this.callbacks.isPreciseHit(hit, candidate.position))
        : undefined;
      if (!intersection) continue;
      const normal =
        intersection.face?.normal
          .clone()
          .transformDirection(intersection.object.matrixWorld)
          .normalize() ??
        new THREE.Vector3(candidate.normal.x, candidate.normal.y, candidate.normal.z);
      return {
        position: candidate.position,
        normal: { x: normal.x, y: normal.y, z: normal.z },
        point: intersection.point,
        distance: intersection.distance,
      };
    }
    return undefined;
  }
}
