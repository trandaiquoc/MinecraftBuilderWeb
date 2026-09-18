import { Injectable, signal } from '@angular/core';
import { CameraState } from './camera';
import { EditorMode } from './editor-mode.service';

@Injectable({ providedIn: 'root' })
export class CameraStateService {
  readonly threeD = signal<CameraState | undefined>(undefined);
  readonly yLayer = signal<CameraState | undefined>(undefined);

  get(mode: EditorMode): CameraState | undefined { return mode === '3d' ? this.threeD() : this.yLayer(); }
  set(mode: EditorMode, state: CameraState): void { (mode === '3d' ? this.threeD : this.yLayer).set(state); }
}
