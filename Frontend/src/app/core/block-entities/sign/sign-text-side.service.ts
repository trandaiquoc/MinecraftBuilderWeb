import { Injectable, signal, type Signal } from '@angular/core';
import { FaceNormal } from '../../editor/placement/placement';
import { PlacedBlock } from '../../domain/project.types';

export type SignTextSide = 'front' | 'back';

/** Transient inspector state chosen from the physical sign face hit by a ray. */
@Injectable({ providedIn: 'root' })
export class SignTextSideService {
  private readonly sideState = signal<SignTextSide>('front');
  readonly side: Signal<SignTextSide> = this.sideState.asReadonly();

  set(side: SignTextSide): void {
    this.sideState.set(side);
  }

  setFromHit(block: PlacedBlock, normal: FaceNormal | undefined): void {
    if (!normal || normal.y !== 0) {
      this.sideState.set('front');
      return;
    }
    const front = signOutwardNormal(block);
    this.sideState.set(
      front.x === Math.sign(normal.x) && front.z === Math.sign(normal.z) ? 'front' : 'back',
    );
  }

  toggle(): void {
    this.sideState.update((side) => (side === 'front' ? 'back' : 'front'));
  }
}

function signOutwardNormal(block: PlacedBlock): { readonly x: number; readonly z: number } {
  const facing = block.state['facing'];
  if (facing === 'north') return { x: 0, z: -1 };
  if (facing === 'east') return { x: 1, z: 0 };
  if (facing === 'west') return { x: -1, z: 0 };
  if (facing === 'south') return { x: 0, z: 1 };
  const rotation = Number(block.state['rotation']) & 15;
  const angle = (rotation * Math.PI) / 8;
  return { x: Math.round(-Math.sin(angle)), z: Math.round(Math.cos(angle)) };
}
