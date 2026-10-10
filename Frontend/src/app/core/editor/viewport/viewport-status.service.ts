import { Injectable, signal } from '@angular/core';
import { VoxelCoordinate } from '../../domain/project.types';
import { PlacementStatus } from '../placement/placement';

export interface ViewportStatusOwner {
  readonly id: number;
}

export interface ViewportHitCoordinate {
  readonly block?: VoxelCoordinate;
  readonly target?: VoxelCoordinate;
}

/** The structure voxel represented by a viewport hit, preferring an existing block. */
export function hoverCoordinateForHit(hit: ViewportHitCoordinate): VoxelCoordinate | undefined {
  return hit.block ? { ...hit.block } : hit.target ? { ...hit.target } : undefined;
}

@Injectable({ providedIn: 'root' })
export class ViewportStatusService {
  readonly target = signal<VoxelCoordinate | undefined>(undefined);
  readonly validation = signal<PlacementStatus>('invalid');
  readonly projectId = signal<string | undefined>(undefined);

  private nextOwner = 1;
  private readonly owners = new Set<number>();
  private activeOwner?: number;

  claim(): ViewportStatusOwner {
    const owner = { id: this.nextOwner++ };
    this.owners.add(owner.id);
    return owner;
  }

  activate(owner: ViewportStatusOwner, projectId?: string): void {
    if (!this.owners.has(owner.id)) return;
    if (this.activeOwner === owner.id && this.projectId() === projectId) return;
    this.activeOwner = owner.id;
    this.clearState();
    this.projectId.set(projectId);
  }

  /** Deactivates a retained viewport without releasing its ownership token. */
  deactivate(owner: ViewportStatusOwner): void {
    if (this.activeOwner !== owner.id) return;
    this.activeOwner = undefined;
    this.clearState();
    this.projectId.set(undefined);
  }

  publish(
    owner: ViewportStatusOwner,
    projectId: string | undefined,
    target: VoxelCoordinate | undefined,
    validation: PlacementStatus = 'invalid',
  ): void {
    if (this.activeOwner !== owner.id) return;
    if (this.projectId() !== projectId) {
      this.clearState();
      return;
    }
    const current = this.target();
    if (sameCoordinate(current, target) && this.validation() === validation) return;
    this.target.set(target ? { ...target } : undefined);
    this.validation.set(validation);
  }

  clear(owner: ViewportStatusOwner): void {
    if (this.activeOwner !== owner.id) return;
    if (!this.target() && this.validation() === 'invalid') return;
    this.clearState();
  }

  release(owner: ViewportStatusOwner): void {
    this.owners.delete(owner.id);
    if (this.activeOwner !== owner.id) return;
    this.activeOwner = undefined;
    this.clearState();
    this.projectId.set(undefined);
  }

  private clearState(): void {
    this.target.set(undefined);
    this.validation.set('invalid');
  }
}

function sameCoordinate(a: VoxelCoordinate | undefined, b: VoxelCoordinate | undefined): boolean {
  return a?.x === b?.x && a?.y === b?.y && a?.z === b?.z;
}
