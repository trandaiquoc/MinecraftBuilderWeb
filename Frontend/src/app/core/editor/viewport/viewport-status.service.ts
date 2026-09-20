import { Injectable, signal } from '@angular/core';
import { VoxelCoordinate } from '../../domain/project.types';
import { PlacementStatus } from '../placement/placement';

@Injectable({ providedIn: 'root' })
export class ViewportStatusService {
  readonly target = signal<VoxelCoordinate | undefined>(undefined);
  readonly validation = signal<PlacementStatus>('invalid');

  set(target: VoxelCoordinate | undefined, validation: PlacementStatus): void { this.target.set(target); this.validation.set(validation); }
  clear(): void { this.target.set(undefined); this.validation.set('invalid'); }
}
