import * as THREE from 'three';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import type { DecorationPlacementPlan } from '../../decorations/placement/decoration-placement';
import { createDecorationVisual, type DecorationTextureCache } from '../visuals/decoration-visuals';
import type { ResolvedItemVisual } from '../geometry/block-model-geometry';
import type { ViewportThemePalette } from '../engine/viewport-theme';
import { disposeObject } from './renderer-resource-disposal';

export interface DecorationGhostPresenterCallbacks {
  readonly textureUrl?: (resource: string) => string | undefined;
  readonly itemResources?: (itemId: string) => readonly string[];
  readonly itemVisual?: (itemId: string) => ResolvedItemVisual | undefined;
  readonly paintingResource?: (variantId: string) => string | undefined;
  readonly textureCache: () => DecorationTextureCache | undefined;
  readonly scheduleRender: () => void;
}

/** Owns the transient decoration placement preview and its resources. */
export class DecorationGhostPresenter {
  readonly group = new THREE.Group();
  private key = '';
  private status?: DecorationPlacementPlan['status'];

  constructor(private palette: ViewportThemePalette, private readonly callbacks: DecorationGhostPresenterCallbacks) {}

  get currentKey(): string { return this.key; }
  set currentKey(value: string) { this.key = value; }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    this.group.traverse((object) => { if (object.userData['decorationGhostOutline'] && object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(this.status === 'valid' ? palette.valid : palette.invalid); });
  }

  clear(): void {
    const changed = this.group.children.length > 0 || this.key !== '' || this.status !== undefined;
    for (const child of [...this.group.children]) { disposeObject(child); this.group.remove(child); }
    this.key = '';
    this.status = undefined;
    if (changed) this.callbacks.scheduleRender();
  }

  update(candidate: PlacedDecoration, status: DecorationPlacementPlan['status']): void {
    const key = `${stableValue(candidate)}|${status}`;
    if (key === this.key) return;
    this.clear();
    this.key = key;
    this.status = status;
    const visual = createDecorationVisual(candidate, this.callbacks.textureUrl, this.callbacks.textureCache(), this.callbacks.paintingResource, this.callbacks.itemResources, this.callbacks.itemVisual, false);
    visual.renderOrder = 2000;
    visual.traverse((object) => { object.renderOrder = 2000; if (object instanceof THREE.Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material.transparent = true; material.opacity = .5; material.depthWrite = false; material.depthTest = false; } } });
    const bounds = new THREE.Box3().setFromObject(visual);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bounds.max.x - bounds.min.x + .05, bounds.max.y - bounds.min.y + .05, bounds.max.z - bounds.min.z + .05)), new THREE.LineBasicMaterial({ color: status === 'valid' ? this.palette.valid : this.palette.invalid, depthTest: false, depthWrite: false }));
    outline.position.copy(bounds.getCenter(new THREE.Vector3()));
    outline.userData['decorationGhostOutline'] = true;
    outline.renderOrder = 2001;
    visual.add(outline);
    this.group.add(visual);
    this.callbacks.scheduleRender();
  }

  dispose(): void { this.clear(); }
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
