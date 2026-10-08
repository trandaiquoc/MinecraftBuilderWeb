import * as THREE from 'three';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import { applyStructureGuideBrightnessToObject, STRUCTURE_GUIDE_BRIGHTNESS } from '../engine/block-brightness';
import { disposeObject } from './renderer-resource-disposal';

export interface StructureBlockGuidePresenterCallbacks {
  readonly scheduleRender: () => void;
  readonly currentProvider: () => BlockVisualProvider | undefined;
}

/** Owns the optional structure-block helper visual and its async stale guards. */
export class StructureBlockGuidePresenter {
  readonly group = new THREE.Group();
  private key = '';
  private generation = 0;

  constructor(private readonly callbacks: StructureBlockGuidePresenterCallbacks) {
    this.group.name = 'structureBlockGuide';
  }

  get currentKey(): string { return this.key; }
  set currentKey(value: string) { this.key = value; }

  update(key: string, project: ProjectDocument | undefined, enabled: boolean, definition: BlockDefinition | undefined, provider: BlockVisualProvider | undefined, guidePosition: VoxelCoordinate): void {
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!project || !enabled || !provider || !definition) return;
    const generation = this.generation;
    const sourceProvider = provider;
    const guideBlock: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:structure_block',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: { ...definition.defaultState, mode: 'save' },
    };
    void provider.create(guideBlock).then((visual) => {
      if (generation !== this.generation || key !== this.key || sourceProvider !== this.callbacks.currentProvider() || !visual.object || visual.mode === 'fallback') {
        if (visual.object) disposeObject(visual.object);
        return;
      }
      const guide = new THREE.Group();
      guide.name = 'structureBlockGuide';
      guide.userData['structureBlockGuide'] = true;
      const object = visual.object;
      object.userData['structureBlockGuide'] = true;
      applyStructureGuideBrightnessToObject(object, STRUCTURE_GUIDE_BRIGHTNESS);
      const bounds = new THREE.Box3().setFromObject(object);
      if (!Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.x)) { disposeObject(object); return; }
      guide.add(object);
      guide.position.set(guidePosition.x, guidePosition.y, guidePosition.z);
      this.group.add(guide);
      this.callbacks.scheduleRender();
    }).catch(() => { /* Missing or invalid assets leave the helper absent. */ });
  }

  clear(): void {
    this.generation += 1;
    for (const child of [...this.group.children]) { disposeObject(child); this.group.remove(child); }
  }

  dispose(): void { this.clear(); }
}
