import { Injectable, signal } from '@angular/core';
import { CameraState } from './camera';
import { EditorMode } from '../state/editor-mode.service';

@Injectable({ providedIn: 'root' })
export class CameraStateService {
  /** The editor has one current world view; switching projections must not restore a stale pose. */
  readonly current = signal<CameraState | undefined>(undefined);
  readonly threeD = this.current;
  readonly yLayer = this.current;

  get(_mode: EditorMode): CameraState | undefined { return this.current(); }
  set(_mode: EditorMode, state: CameraState): void { this.current.set(state); }
}
