import * as THREE from 'three';
import type { ProjectDocument } from '../../domain/project.types';
import type { GroupMovePreview } from '../../editor/groups/group.service';
import { createDecorationVisual, type DecorationTextureCache } from '../visuals/decoration-visuals';
import type { ResolvedItemVisual } from '../visuals/item-visual-resolver';
import type { ViewportThemePalette } from '../engine/viewport-theme';

export interface MovePreviewPresenterCallbacks {
  readonly getBlock: (position: ProjectDocument['blocks'][number]['position']) => ProjectDocument['blocks'][number] | undefined;
  readonly textureUrl?: (resource: string) => string | undefined;
  readonly textureCache: () => DecorationTextureCache | undefined;
  readonly paintingResource?: (variantId: string) => string | undefined;
  readonly itemResources?: (itemId: string) => readonly string[];
  readonly itemVisual?: (itemId: string) => ResolvedItemVisual | undefined;
}

/** Owns non-persistent group move preview geometry. */
export class MovePreviewPresenter {
  readonly group = new THREE.Group();

  constructor(private palette: ViewportThemePalette, private readonly callbacks: MovePreviewPresenterCallbacks) {}

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.MeshBasicMaterial;
      material.color.setHex(object.userData['previewInvalid'] ? palette.invalid : palette.valid);
    });
  }

  update(project: ProjectDocument | undefined, preview: GroupMovePreview | undefined): void {
    for (const child of [...this.group.children]) { child.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.group.remove(child); }
    if (!project || !preview || !preview.offset.x && !preview.offset.y && !preview.offset.z) return;
    const color = preview.valid ? this.palette.valid : this.palette.invalid;
    const movingKeys = new Set(preview.positions.map((position) => `${position.x},${position.y},${position.z}`));
    for (const position of preview.positions) {
      if (!movingKeys.has(`${position.x},${position.y},${position.z}`)) continue;
      const block = this.callbacks.getBlock(position);
      if (!block) continue;
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .42, wireframe: true, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.position.set(block.position.x + preview.offset.x + .5, block.position.y + preview.offset.y + .5, block.position.z + preview.offset.z + .5);
      mesh.renderOrder = 1002;
      mesh.userData['previewInvalid'] = !preview.valid;
      this.group.add(mesh);
    }
    const movingDecorationIds = new Set(preview.decorationIds);
    for (const decoration of (project.decorations ?? []).filter((entry) => movingDecorationIds.has(entry.instanceId))) {
      const visual = createDecorationVisual(decoration, this.callbacks.textureUrl, this.callbacks.textureCache(), this.callbacks.paintingResource, this.callbacks.itemResources, this.callbacks.itemVisual, false);
      visual.position.set(preview.offset.x, preview.offset.y, preview.offset.z);
      visual.renderOrder = 1002;
      visual.traverse((object) => {
        object.renderOrder = 1002;
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            material.transparent = true; material.opacity = .42; material.depthTest = false; material.depthWrite = false;
            if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial) material.color.set(color);
          }
        }
      });
      visual.userData['previewInvalid'] = !preview.valid;
      this.group.add(visual);
    }
  }

  dispose(): void {
    for (const child of [...this.group.children]) { child.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.group.remove(child); }
  }
}
