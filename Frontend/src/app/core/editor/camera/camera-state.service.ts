import { Injectable, signal } from '@angular/core';
import { CameraState } from './camera';
import { EditorMode } from '../state/editor-mode.service';

@Injectable({ providedIn: 'root' })
export class CameraStateService {
  /** The editor has one current world view; switching projections must not restore a stale pose. */
  readonly current = signal<CameraState | undefined>(undefined);
  readonly threeD = this.current;
  readonly yLayer = this.current;
  private readonly byProject = new Map<string, CameraState>();

  get(_mode: EditorMode, projectId?: string): CameraState | undefined {
    return projectId ? this.byProject.get(projectId) : this.current();
  }
  set(_mode: EditorMode, state: CameraState, projectId?: string): void {
    if (projectId) this.byProject.set(projectId, state);
    this.current.set(state);
  }
}
