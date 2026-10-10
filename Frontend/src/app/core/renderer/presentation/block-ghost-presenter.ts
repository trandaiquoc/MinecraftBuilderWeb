import * as THREE from 'three';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { PlacementStatus } from '../../editor/placement/placement';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { ViewportThemePalette } from '../engine/viewport-theme';
import { disposeObject } from './renderer-resource-disposal';

export interface BlockGhostPresenterCallbacks {
  readonly provider: () => BlockVisualProvider | undefined;
  readonly providerGeneration: () => number;
  readonly blockLookup: () =>
    ((position: VoxelCoordinate) => ProjectDocument['blocks'][number] | undefined) | undefined;
  readonly record: (name: 'ghostVisualReuses' | 'ghostVisualRebuilds') => void;
  readonly scheduleRender: () => void;
}

/** Owns the block placement ghost, including async provider stale-result guards. */
export class BlockGhostPresenter {
  readonly ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x4b9cff, transparent: true, opacity: 0.35 }),
  );
  private ghostModel?: THREE.Group;
  private ghostModelKey = '';
  private ghostTarget?: VoxelCoordinate;
  private ghostGeneration = 0;
  private ghostPlan?: PlacementPlan;
  private lastHoverVisualKey = '';
  private readonly ghostBoundsCenter = new THREE.Vector3(0.5, 0.5, 0.5);

  constructor(
    private readonly scene: THREE.Scene,
    private palette: ViewportThemePalette,
    private readonly callbacks: BlockGhostPresenterCallbacks,
  ) {}

  get model(): THREE.Group | undefined {
    return this.ghostModel;
  }
  get modelKey(): string {
    return this.ghostModelKey;
  }
  set modelKey(value: string) {
    this.ghostModelKey = value;
  }
  get target(): VoxelCoordinate | undefined {
    return this.ghostTarget;
  }
  get generation(): number {
    return this.ghostGeneration;
  }
  get plan(): PlacementPlan | undefined {
    return this.ghostPlan;
  }
  set plan(value: PlacementPlan | undefined) {
    this.ghostPlan = value;
  }
  get hoverVisualKey(): string {
    return this.lastHoverVisualKey;
  }
  set hoverVisualKey(value: string) {
    this.lastHoverVisualKey = value;
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    const status = this.ghost.userData['status'] as PlacementStatus | undefined;
    if (status)
      (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(
        colorForStatus(palette, status),
      );
  }

  clear(): void {
    const changed = this.ghost.visible || !!this.ghostModel?.visible;
    this.ghost.visible = false;
    if (this.ghostModel) this.ghostModel.visible = false;
    this.lastHoverVisualKey = '';
    if (changed) this.callbacks.scheduleRender();
  }

  setStatus(status: PlacementStatus): void {
    if (!this.ghost.visible || this.ghost.userData['status'] === status) return;
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(
      colorForStatus(this.palette, status),
    );
    this.ghost.userData['status'] = status;
    this.callbacks.scheduleRender();
  }

  update(
    target: VoxelCoordinate | undefined,
    project: ProjectDocument | undefined,
    active: ActiveBlock | undefined,
    status: PlacementStatus = 'invalid',
    plan?: PlacementPlan,
  ): void {
    this.ghostTarget = target;
    if (!target || !project || !active) {
      this.ghost.visible = false;
      if (this.ghostModel) this.ghostModel.visible = false;
      return;
    }
    this.ghost.visible = true;
    this.positionOutline(target);
    const material = this.ghost.material as THREE.MeshBasicMaterial;
    material.color.setHex(colorForStatus(this.palette, status));
    material.depthTest = false;
    material.depthWrite = false;
    material.wireframe = true;
    this.ghost.renderOrder = 1000;
    this.ghost.userData['activeBlock'] = {
      id: active.id,
      state: { ...active.state },
      status,
      blocks: plan?.blocks.map((block) => ({
        id: block.id,
        position: block.position,
        state: block.state,
      })),
    };
    this.ghost.userData['status'] = status;
    if (this.ghostModel) {
      this.ghostModel.position.set(target.x, target.y, target.z);
      this.ghostModel.visible = true;
    }
  }

  updateModel(active: ActiveBlock | undefined, plan?: PlacementPlan): void {
    const request = plan?.request.position ?? { x: 0, y: 0, z: 0 };
    const relativeBlocks =
      plan?.blocks
        .map(
          (block) =>
            `${block.id}@${block.position.x - request.x},${block.position.y - request.y},${block.position.z - request.z}|${JSON.stringify(block.state)}`,
        )
        .join(';') ?? '';
    const key = active
      ? `${this.callbacks.providerGeneration()}|${active.id}|${JSON.stringify(active.state)}|${relativeBlocks}`
      : '';
    if (key === this.ghostModelKey) {
      if (active) this.callbacks.record('ghostVisualReuses');
      return;
    }
    if (this.ghostModelKey && active) this.callbacks.record('ghostVisualRebuilds');
    this.ghostModelKey = key;
    const generation = ++this.ghostGeneration;
    if (this.ghostModel) {
      this.scene.remove(this.ghostModel);
      disposeObject(this.ghostModel);
      this.ghostModel = undefined;
    }
    this.setOutlineBounds();
    const provider = this.callbacks.provider();
    const providerGeneration = this.callbacks.providerGeneration();
    if (!active || !provider) return;
    const blocks = plan?.blocks.length
      ? plan.blocks
      : [
          {
            kind: 'resolved' as const,
            id: active.id,
            namespace: active.id.split(':')[0] ?? 'minecraft',
            position: { x: 0, y: 0, z: 0 },
            state: active.state,
          },
        ];
    const lookup = this.callbacks.blockLookup();
    const worldContext = lookup ? { getBlock: lookup } : undefined;
    void Promise.all(
      blocks.map(async (block) => ({
        block,
        visual: await provider.create({ ...block, position: { x: 0, y: 0, z: 0 } }, worldContext),
      })),
    )
      .then((results) => {
        if (
          generation !== this.ghostGeneration ||
          providerGeneration !== this.callbacks.providerGeneration() ||
          provider !== this.callbacks.provider() ||
          !results.length
        ) {
          for (const { visual } of results) if (visual.object) disposeObject(visual.object);
          return;
        }
        const root = new THREE.Group();
        for (const { block, visual } of results) {
          if (!visual.object) continue;
          visual.object.position.set(
            visual.object.position.x + block.position.x - request.x,
            visual.object.position.y + block.position.y - request.y,
            visual.object.position.z + block.position.z - request.z,
          );
          root.add(visual.object);
        }
        if (!root.children.length) return;
        this.ghostModel = root;
        this.ghostModel.visible = false;
        this.ghostModel.renderOrder = 999;
        this.ghostModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const material of materials) {
              material.transparent = true;
              material.opacity = 0.52;
              material.depthWrite = false;
            }
          }
        });
        this.scene.add(this.ghostModel);
        const bounds = new THREE.Box3().setFromObject(this.ghostModel);
        this.setOutlineBounds(bounds);
        if (this.ghostTarget) {
          this.ghostModel.position.set(this.ghostTarget.x, this.ghostTarget.y, this.ghostTarget.z);
          this.ghostModel.visible = this.ghost.visible;
          this.positionOutline(this.ghostTarget);
        }
        this.callbacks.scheduleRender();
      })
      .catch((error: unknown) => {
        if (
          generation !== this.ghostGeneration ||
          providerGeneration !== this.callbacks.providerGeneration() ||
          provider !== this.callbacks.provider()
        )
          return;
        this.ghost.userData['renderMode'] = 'fallback';
        this.ghost.userData['diagnostics'] = [
          {
            code: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'Unknown ghost visual provider error',
          },
        ];
        this.callbacks.scheduleRender();
      });
  }

  dispose(): void {
    this.scene.remove(this.ghost);
    if (this.ghostModel) {
      this.scene.remove(this.ghostModel);
      disposeObject(this.ghostModel);
    }
    this.ghost.geometry.dispose();
    (this.ghost.material as THREE.Material).dispose();
  }

  private setOutlineBounds(
    bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)),
  ): void {
    const size = bounds.getSize(new THREE.Vector3());
    bounds.getCenter(this.ghostBoundsCenter);
    this.ghost.geometry.dispose();
    this.ghost.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  }

  private positionOutline(target: VoxelCoordinate): void {
    this.ghost.position.set(
      target.x + this.ghostBoundsCenter.x,
      target.y + this.ghostBoundsCenter.y,
      target.z + this.ghostBoundsCenter.z,
    );
  }
}

function colorForStatus(palette: ViewportThemePalette, status: PlacementStatus): number {
  switch (status) {
    case 'valid':
      return palette.valid;
    case 'warning':
      return palette.warning;
    case 'unknown':
      return palette.unknown;
    default:
      return palette.invalid;
  }
}
