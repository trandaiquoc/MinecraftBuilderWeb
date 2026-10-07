import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraBounds, CameraPreset, CameraState, CameraVector } from '../../editor/camera/camera';
import { cameraBoundsCenter, cameraDistanceForBounds, projectCameraBounds, structureCameraBounds } from '../../editor/camera/camera';
import { blocksForLayers, type YLayerVisibility } from '../../editor/viewport/y-layer';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { perspectiveDirection, presetDirection, vectorValue } from '../engine/viewport-render-helpers';

export interface ViewportCameraFramingCallbacks {
  readonly project: () => ProjectDocument | undefined;
  readonly renderOptions: () => { readonly layerY?: number; readonly visibility?: YLayerVisibility };
  readonly scheduleRender: () => void;
}

/** Owns camera frame persistence and non-input framing operations. */
export class ViewportCameraFramingController {
  private hasFrame = false;
  private projectId?: string;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly controls: () => OrbitControls | undefined, private readonly callbacks: ViewportCameraFramingCallbacks) {}

  get hasCameraFrame(): boolean { return this.hasFrame; }
  get cameraProjectId(): string | undefined { return this.projectId; }
  set cameraProjectId(value: string | undefined) { this.projectId = value; }

  cameraState(): CameraState | undefined {
    const controls = this.controls();
    if (!controls) return undefined;
    return { position: vectorValue(this.camera.position), target: vectorValue(controls.target), up: vectorValue(this.camera.up) };
  }

  restoreCamera(state: CameraState | undefined, projectId?: string): void {
    const controls = this.controls();
    if (!state || !controls) return;
    this.camera.position.set(state.position.x, state.position.y, state.position.z); this.camera.up.set(state.up.x, state.up.y, state.up.z); controls.target.set(state.target.x, state.target.y, state.target.z); controls.update();
    this.hasFrame = true; this.projectId = projectId; this.callbacks.scheduleRender();
  }

  fitStructure(): void {
    const project = this.callbacks.project(); if (!project) return;
    const options = this.callbacks.renderOptions();
    const blocks = options.layerY === undefined || !options.visibility ? project.blocks : blocksForLayers(project.blocks, options.layerY, options.visibility);
    this.frameBounds(structureCameraBounds(blocks) ?? projectCameraBounds(project.size));
  }

  focusSelection(position: VoxelCoordinate | undefined): void { if (position) this.focusBounds({ min: position, max: { x: position.x + 1, y: position.y + 1, z: position.z + 1 } }); }

  focusBounds(bounds: CameraBounds | undefined): void {
    const controls = this.controls();
    if (!bounds || !controls) return;
    const target = cameraBoundsCenter(bounds); const direction = this.camera.position.clone().sub(controls.target); const viewDirection = direction.lengthSq() ? direction.normalize() : perspectiveDirection();
    this.setCamera(target, viewDirection, cameraDistanceForBounds(bounds, this.camera.fov, this.camera.aspect));
  }

  resetCamera(): void { const project = this.callbacks.project(); if (!project) return; this.hasFrame = true; this.projectId = project.id; this.frameBounds(projectCameraBounds(project.size)); }

  setCameraPreset(preset: CameraPreset): void {
    const controls = this.controls(); if (!controls) return;
    this.setCamera(vectorValue(controls.target), presetDirection(preset), Math.max(4, this.camera.position.distanceTo(controls.target)), preset === 'top' ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 });
  }

  frameBounds(bounds: ReturnType<typeof projectCameraBounds>): void { this.setCamera(cameraBoundsCenter(bounds), perspectiveDirection(), cameraDistanceForBounds(bounds, this.camera.fov, this.camera.aspect)); }
  private setCamera(target: CameraVector, direction: THREE.Vector3, distance: number, up: CameraVector = { x: 0, y: 1, z: 0 }): void {
    const controls = this.controls(); if (!controls) return;
    this.camera.up.set(up.x, up.y, up.z); controls.target.set(target.x, target.y, target.z); this.camera.position.set(target.x, target.y, target.z).addScaledVector(direction, distance); controls.update(); this.callbacks.scheduleRender();
  }
}
