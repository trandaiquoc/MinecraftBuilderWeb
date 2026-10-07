import * as THREE from 'three';
import type { FaceNormal } from '../../editor/placement/placement';
import type { ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { ddaVoxelCandidates, type VoxelRaycastCandidate } from './voxel-raycast';

export interface ViewportRayHit { readonly position: VoxelCoordinate; readonly normal: FaceNormal; readonly point: THREE.Vector3; readonly distance: number; }
export interface ViewportRaycastCallbacks {
  readonly classify: (position: VoxelCoordinate) => 'skip' | 'hit' | 'fallback';
  readonly precise: (candidates: readonly VoxelRaycastCandidate[]) => ViewportRayHit | undefined;
  readonly record: (name: 'ddaPickCount' | 'precisePickFallbacks' | 'ddaVisitedVoxels' | 'ddaFullCubeHits', value?: number) => void;
}

/** Owns the bounded DDA fast path; precise ownership resolution stays in the facade port. */
export class ViewportRaycastController {
  constructor(private readonly callbacks: ViewportRaycastCallbacks) {}

  pick(ray: THREE.Ray, size: ProjectSize): ViewportRayHit | undefined {
    this.callbacks.record('ddaPickCount');
    const result = ddaVoxelCandidates({ origin: ray.origin, direction: ray.direction }, size, this.callbacks.classify);
    if (!result) return undefined;
    this.callbacks.record('ddaVisitedVoxels', result.visitedVoxels);
    if (result.candidates.length) {
      this.callbacks.record('precisePickFallbacks');
      const precise = this.callbacks.precise(result.candidates);
      if (precise) return precise;
    }
    if (!result.fullCubeHit) return undefined;
    this.callbacks.record('ddaFullCubeHits');
    return { position: result.fullCubeHit.position, normal: result.fullCubeHit.normal, point: new THREE.Vector3(result.fullCubeHit.point.x, result.fullCubeHit.point.y, result.fullCubeHit.point.z), distance: result.fullCubeHit.distance };
  }
}
