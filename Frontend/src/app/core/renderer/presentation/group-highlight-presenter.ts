import * as THREE from 'three';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { isBlockVisible } from '../../editor/groups/group-membership';
import { decorationAabb } from '../../decorations/placement/decoration-placement';
import { decorationHasGroup, isDecorationVisible } from '../../editor/groups/decoration-membership';
import type { ViewportThemePalette } from '../engine/viewport-theme';
import { selectionBounds } from './selection-bounds';

export interface GroupHighlightPresenterCallbacks {
  readonly visibleBlock: (
    key: string,
  ) => { readonly block: ProjectDocument['blocks'][number] } | undefined;
  readonly blockAt: (position: VoxelCoordinate) => ProjectDocument['blocks'][number] | undefined;
  readonly isolated: (key: string) => boolean;
  readonly isolationActive: () => boolean;
  readonly decorationIsolated: (
    entry: NonNullable<ProjectDocument['decorations']>[number],
  ) => boolean;
}

/** Owns active-group outlines and exact-ID block usage highlighting. */
export class GroupHighlightPresenter {
  readonly group = new THREE.Group();
  readonly groupHighlightGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(1.12, 1.12, 1.12),
  );
  readonly groupHighlightMaterial = new THREE.LineBasicMaterial({ color: 0x58d8d0 });
  readonly blockUsageHighlightGeometry = new THREE.BoxGeometry(0.98, 0.98, 0.98);
  readonly blockUsageHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0x62d8ff,
    transparent: true,
    opacity: 0.2,
    depthTest: false,
    depthWrite: false,
  });
  private blockUsageHighlight?: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private blockUsageHighlightCapacity = 0;
  private readonly matrix = new THREE.Matrix4();

  constructor(
    private readonly scene: THREE.Scene,
    private palette: ViewportThemePalette,
    private readonly callbacks: GroupHighlightPresenterCallbacks,
  ) {
    this.group.name = 'groupHighlightPresenter';
  }

  get usageOverlay(): THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | undefined {
    return this.blockUsageHighlight;
  }
  set usageOverlay(
    value: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | undefined,
  ) {
    this.blockUsageHighlight = value;
  }
  get usageCapacity(): number {
    return this.blockUsageHighlightCapacity;
  }
  set usageCapacity(value: number) {
    this.blockUsageHighlightCapacity = value;
  }

  mount(): void {
    this.scene.add(this.group);
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    this.group.traverse((object) => {
      if (object.userData['groupHighlight'] && object instanceof THREE.LineSegments)
        (object.material as THREE.LineBasicMaterial).color.setHex(
          object.userData['groupLocked'] ? palette.lockedGroup : palette.group,
        );
    });
    this.blockUsageHighlightMaterial.color.setHex(palette.group);
  }

  updateActiveGroup(
    project: ProjectDocument | undefined,
    activeGroupId: string | undefined,
    positions: readonly VoxelCoordinate[] | undefined,
  ): void {
    for (const child of [...this.group.children]) {
      child.traverse((object) => {
        if (object instanceof THREE.LineSegments && !object.userData['sharedGroupHighlight']) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      this.group.remove(child);
    }
    if (!project || !activeGroupId) return;
    const group = project.groups.find((entry) => entry.id === activeGroupId);
    const color = group?.locked ? this.palette.lockedGroup : this.palette.group;
    this.groupHighlightMaterial.color.setHex(color);
    const isolateCommitted = this.callbacks.isolationActive();
    const visiblePositions = (positions ?? []).filter(
      (position) => !isolateCommitted || this.callbacks.isolated(coordinateKey(position)),
    );
    const aggregateGroup = visiblePositions.length > 256;
    if (aggregateGroup) {
      const bounds = selectionBounds(visiblePositions);
      if (bounds) {
        const aggregate = new THREE.LineSegments(
          this.groupHighlightGeometry,
          this.groupHighlightMaterial,
        );
        aggregate.position.set(
          (bounds.min.x + bounds.max.x + 1) / 2,
          (bounds.min.y + bounds.max.y + 1) / 2,
          (bounds.min.z + bounds.max.z + 1) / 2,
        );
        aggregate.scale.set(
          bounds.max.x - bounds.min.x + 1,
          bounds.max.y - bounds.min.y + 1,
          bounds.max.z - bounds.min.z + 1,
        );
        aggregate.userData['groupHighlight'] = true;
        aggregate.userData['sharedGroupHighlight'] = true;
        aggregate.renderOrder = 1000;
        this.group.add(aggregate);
      }
    }
    const positionKeys = new Set(positions?.map(coordinateKey));
    for (const position of aggregateGroup ? [] : visiblePositions) {
      const key = coordinateKey(position);
      if (
        !positionKeys.has(key) ||
        !this.callbacks.visibleBlock(key) ||
        (isolateCommitted && !this.callbacks.isolated(key))
      )
        continue;
      const block = this.callbacks.blockAt(position);
      if (!block || !isBlockVisible(block, project.groups)) continue;
      const outline = new THREE.LineSegments(
        this.groupHighlightGeometry,
        this.groupHighlightMaterial,
      );
      outline.position.set(block.position.x + 0.5, block.position.y + 0.5, block.position.z + 0.5);
      outline.userData['groupHighlight'] = true;
      outline.userData['groupLocked'] = !!group?.locked;
      outline.renderOrder = 1000;
      this.group.add(outline);
    }
    for (const decoration of (project.decorations ?? []).filter(
      (entry) =>
        decorationHasGroup(entry, activeGroupId) &&
        isDecorationVisible(entry, project.groups) &&
        (!isolateCommitted || this.callbacks.decorationIsolated(entry)),
    )) {
      const bounds = decorationAabb(decoration);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(
          new THREE.BoxGeometry(
            Math.max(0.04, bounds.max.x - bounds.min.x + 0.08),
            Math.max(0.04, bounds.max.y - bounds.min.y + 0.08),
            Math.max(0.04, bounds.max.z - bounds.min.z + 0.08),
          ),
        ),
        new THREE.LineBasicMaterial({ color }),
      );
      outline.position.set(
        (bounds.min.x + bounds.max.x) / 2,
        (bounds.min.y + bounds.max.y) / 2,
        (bounds.min.z + bounds.max.z) / 2,
      );
      outline.userData['groupHighlight'] = true;
      outline.userData['groupLocked'] = !!group?.locked;
      outline.renderOrder = 1000;
      this.group.add(outline);
    }
  }

  clearUsage(): void {
    if (!this.blockUsageHighlight) return;
    this.blockUsageHighlight.visible = false;
    this.blockUsageHighlight.count = 0;
  }

  updateUsage(id: string | undefined, positions: readonly VoxelCoordinate[] | undefined): void {
    const overlay = this.blockUsageHighlight;
    if (!overlay) return;
    if (!id || !positions?.length) {
      overlay.visible = false;
      overlay.count = 0;
      return;
    }
    const visible = positions.filter((position) => {
      const key = coordinateKey(position);
      const entry = this.callbacks.visibleBlock(key);
      return (
        !!entry &&
        entry.block.id === id &&
        (!this.callbacks.isolationActive() || this.callbacks.isolated(key))
      );
    });
    if (!visible.length) {
      overlay.visible = false;
      overlay.count = 0;
      return;
    }
    if (visible.length > this.blockUsageHighlightCapacity) {
      const replacement = new THREE.InstancedMesh(
        this.blockUsageHighlightGeometry,
        this.blockUsageHighlightMaterial,
        visible.length,
      );
      replacement.frustumCulled = false;
      replacement.renderOrder = 1900;
      replacement.userData['blockUsageHighlight'] = true;
      if (overlay.parent) overlay.parent.remove(overlay);
      overlay.dispose();
      this.blockUsageHighlight = replacement;
      this.blockUsageHighlightCapacity = visible.length;
      this.scene.add(replacement);
    }
    const target = this.blockUsageHighlight;
    if (!target) return;
    target.count = visible.length;
    for (let index = 0; index < visible.length; index += 1) {
      const position = visible[index];
      this.matrix.makeTranslation(position.x + 0.5, position.y + 0.5, position.z + 0.5);
      target.setMatrixAt(index, this.matrix);
    }
    target.instanceMatrix.needsUpdate = true;
    target.visible = true;
  }

  createUsageOverlay(): void {
    this.blockUsageHighlight = new THREE.InstancedMesh(
      this.blockUsageHighlightGeometry,
      this.blockUsageHighlightMaterial,
      1,
    );
    this.blockUsageHighlight.visible = false;
    this.blockUsageHighlight.count = 0;
    this.blockUsageHighlight.frustumCulled = false;
    this.blockUsageHighlight.renderOrder = 1900;
    this.blockUsageHighlight.userData['blockUsageHighlight'] = true;
    this.scene.add(this.blockUsageHighlight);
  }

  dispose(): void {
    for (const child of [...this.group.children]) {
      child.traverse((object) => {
        if (object instanceof THREE.LineSegments && !object.userData['sharedGroupHighlight']) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      this.group.remove(child);
    }
    this.scene.remove(this.group);
    if (this.blockUsageHighlight) {
      this.scene.remove(this.blockUsageHighlight);
      this.blockUsageHighlight.dispose();
      this.blockUsageHighlight = undefined;
    }
    this.groupHighlightGeometry.dispose();
    this.groupHighlightMaterial.dispose();
    this.blockUsageHighlightGeometry.dispose();
    this.blockUsageHighlightMaterial.dispose();
  }
}
