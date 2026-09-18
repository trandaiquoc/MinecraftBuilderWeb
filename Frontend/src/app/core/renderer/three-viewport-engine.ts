import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ActiveBlock } from '../blocks/active-block.service';
import { ProjectDocument, ProjectSize, VoxelCoordinate } from '../domain/project.types';
import { FaceNormal, resolveAttachmentPlacement, placementStatus, projectGridBounds, targetFromBlockFace, targetFromEditingPlaneHit, targetFromGridHit, PlacementContext, PlacementStatus } from '../editor/placement';
import { blocksForLayers, YLayerVisibility } from '../editor/y-layer';
import { cameraBoundsCenter, cameraDistanceForBounds, CameraPreset, CameraState, CameraVector, projectCameraBounds, selectedVoxelCenter, structureCameraBounds } from '../editor/camera';
import { isBlockVisible } from '../editor/group-membership';
import { GroupMovePreview } from '../editor/group.service';
import { ViewportThemePalette, viewportThemePalette } from './viewport-theme';
import { BlockVisualProvider } from './block-model-geometry';
import { PlacementPlan } from '../behavior/placement-plan';

export interface ViewportHit { readonly target?: VoxelCoordinate; readonly status: PlacementStatus; readonly block?: VoxelCoordinate; readonly faceNormal?: FaceNormal; readonly placementContext?: PlacementContext; }
type PlacementPlanProvider = (project: ProjectDocument, active: ActiveBlock, target: VoxelCoordinate, context: PlacementContext | undefined) => PlacementPlan | undefined;
export interface ViewportRenderOptions { readonly layerY?: number; readonly visibility?: YLayerVisibility; readonly referenceOpacity?: number; readonly selected?: VoxelCoordinate; readonly selectedPositions?: readonly VoxelCoordinate[]; readonly selectionBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly isolatedGroupId?: string; readonly isolatedGroupPositions?: readonly VoxelCoordinate[]; readonly activeGroupId?: string; readonly activeGroupPositions?: readonly VoxelCoordinate[]; readonly groupMovePreview?: GroupMovePreview; }
export interface ViewportDiagnostics { readonly initialized: boolean; readonly disposed: boolean; readonly canvasWidth: number; readonly canvasHeight: number; readonly gridExists: boolean; readonly boundsExists: boolean; readonly rendererExists: boolean; readonly sceneExists: true; readonly cameraExists: true; readonly controlsExist: boolean; readonly themeApplied: boolean; readonly resizeApplied: boolean; readonly renderMode: 'demand'; readonly renderCount: number; }

export const VIEWPORT_BOOTSTRAP_SIZE: ProjectSize = { x: 16, y: 16, z: 16 };

/** Adds voxel/world translation without replacing a special visual's local vanilla transform. */
export function translateVisualToVoxel(object: THREE.Object3D, position: VoxelCoordinate): void {
  object.position.set(object.position.x + position.x, object.position.y + position.y, object.position.z + position.z);
}

export function viewportRenderSize(width: number, height: number): { readonly width: number; readonly height: number } {
  return { width: Math.max(Math.round(width), 1), height: Math.max(Math.round(height), 1) };
}

export class ThreeViewportEngine {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly blocksGroup = new THREE.Group();
  private readonly ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x4b9cff, transparent: true, opacity: 0.35 }));
  private readonly selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffd166 }));
  private readonly selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
  private readonly movePreviewGroup = new THREE.Group();
  private readonly logicalSelectionGroup = new THREE.Group();
  private ghostModel?: THREE.Group;
  private ghostModelKey = '';
  private ghostTarget?: VoxelCoordinate;
  private readonly ghostBoundsCenter = new THREE.Vector3(.5, .5, .5);
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private ground?: THREE.Mesh;
  private editingPlane?: THREE.Mesh;
  private editingGrid?: THREE.LineSegments;
  private projectGrid?: THREE.LineSegments;
  private boundsBox?: THREE.Box3Helper;
  private container?: HTMLElement;
  private resizeObserver?: ResizeObserver;
  private project?: ProjectDocument;
  private activeBlock?: ActiveBlock;
  private renderOptions: ViewportRenderOptions = {};
  private hasCameraFrame = false;
  private readonly renderOnControlChange = () => this.render();
  private readonly pressedKeys = new Set<string>();
  private cameraMoveFrame?: number;
  private readonly onCameraKeyDown = (event: KeyboardEvent) => { if (isTextInput(event.target)) { this.clearInput(); return; } if (!cameraMovementCodes.has(event.code)) return; event.preventDefault(); this.pressedKeys.add(event.code); this.startCameraMovement(); };
  private readonly onCameraKeyUp = (event: KeyboardEvent) => { if (cameraMovementCodes.has(event.code)) this.pressedKeys.delete(event.code); };
  private readonly onWindowBlur = () => this.clearInput();
  private readonly onVisibilityChange = () => { if (document.hidden) this.clearInput(); };
  private palette: ViewportThemePalette = viewportThemePalette('dark');
  private visualProvider?: BlockVisualProvider;
  private placementPlanProvider?: PlacementPlanProvider;
  private visualGeneration = 0;
  private ghostGeneration = 0;
  private disposed = false;
  private renderCount = 0;
  private canvasSize = { width: 0, height: 0 };
  private themeApplied = false;

  mount(container: HTMLElement): void {
    if (this.disposed) return;
    if (this.renderer) { this.resize(); return; }
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.applyTheme(this.palette);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x394454, 2.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15); keyLight.position.set(6, 10, 7); this.scene.add(keyLight);
    this.scene.add(this.blocksGroup);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.selectionOutline.visible = false;
    this.selectionOutline.renderOrder = 1001;
    this.scene.add(this.selectionOutline);
    this.selectionBox.visible = false;
    this.selectionBox.renderOrder = 1001;
    this.scene.add(this.selectionBox);
    this.scene.add(this.movePreviewGroup);
    this.scene.add(this.logicalSelectionGroup);
    this.camera.position.set(12, 10, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    delete this.controls.mouseButtons.LEFT;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.addEventListener('change', this.renderOnControlChange);
    document.addEventListener('keydown', this.onCameraKeyDown); document.addEventListener('keyup', this.onCameraKeyUp); document.addEventListener('focusin', this.onWindowBlur); window.addEventListener('blur', this.onWindowBlur); document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    if (this.project) this.resetCamera();
    else this.frameBounds(projectCameraBounds(VIEWPORT_BOOTSTRAP_SIZE));
    this.render();
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    this.themeApplied = true;
    this.scene.background = new THREE.Color(palette.background);
    (this.projectGrid?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.grid);
    (this.editingGrid?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.editingGrid);
    (this.boundsBox?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.bounds);
    applyBlockTheme(this.blocksGroup, palette);
    (this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(palette.selection);
    (this.selectionBox.material as THREE.LineBasicMaterial).color.setHex(palette.selection);
    this.logicalSelectionGroup.traverse((object) => { if (object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(palette.selection); });
    this.scene.traverse((object) => { if (object.userData['groupHighlight'] && object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(object.userData['groupLocked'] ? palette.lockedGroup : palette.group); });
    this.movePreviewGroup.traverse((object) => { if (object instanceof THREE.Mesh) (object.material as THREE.MeshBasicMaterial).color.setHex(object.userData['previewInvalid'] ? palette.invalid : palette.valid); });
    const ghostStatus = this.ghost.userData['status'] as PlacementStatus | undefined;
    if (ghostStatus) (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(colorForStatus(this.palette, ghostStatus));
    this.render();
  }

  resize(): void {
    if (!this.renderer || !this.container) return;
    const { width, height } = this.container.getBoundingClientRect();
    const size = viewportRenderSize(width, height);
    this.canvasSize = size;
    this.camera.aspect = size.width / size.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(size.width, size.height, false);
    this.render();
  }

  setVisualProvider(provider: BlockVisualProvider | undefined): void {
    if (this.visualProvider === provider) return;
    this.visualProvider = provider;
    this.ghostModelKey = '';
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  setPlacementPlanProvider(provider: PlacementPlanProvider | undefined): void { this.placementPlanProvider = provider; }

  update(project: ProjectDocument | undefined, active: ActiveBlock | undefined, options: ViewportRenderOptions = {}): void {
    const generation = ++this.visualGeneration;
    this.project = project;
    this.activeBlock = active;
    this.renderOptions = options;
    for (const child of [...this.blocksGroup.children]) { child.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.blocksGroup.remove(child); }
    if (project) {
      const layeredBlocks = options.layerY === undefined || !options.visibility ? project.blocks : blocksForLayers(project.blocks, options.layerY, options.visibility);
      const isolatedKeys = new Set(options.isolatedGroupPositions?.map((position) => `${position.x},${position.y},${position.z}`));
      const visibleBlocks = layeredBlocks.filter((block) => isBlockVisible(block, project.groups) && (!options.isolatedGroupId || isolatedKeys.has(`${block.position.x},${block.position.y},${block.position.z}`)));
      for (const block of visibleBlocks) {
        const isReference = options.layerY !== undefined && block.position.y !== options.layerY;
        const role = block.kind === 'missing' ? 'missing' : isReference ? 'reference' : 'normal';
        const material = new THREE.MeshLambertMaterial({ color: role === 'missing' ? this.palette.missingBlock : role === 'reference' ? this.palette.referenceBlock : this.palette.block, transparent: isReference, opacity: isReference ? options.referenceOpacity ?? 0.28 : 1 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
        mesh.position.set(block.position.x + .5, block.position.y + .5, block.position.z + .5);
        mesh.userData['voxel'] = block.position;
        mesh.userData['renderRole'] = role;
        this.blocksGroup.add(mesh);
        if (this.visualProvider && block.kind !== 'missing') void this.visualProvider.create(block).then((visual) => {
          if (generation !== this.visualGeneration || mesh.parent !== this.blocksGroup) return;
          mesh.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics]; mesh.userData['resolvedSupport'] = visual.resolved.support;
          mesh.userData['renderMode'] = visual.mode; mesh.userData['renderTrace'] = visual.trace;
          if (!visual.object) return;
          const object = visual.object; translateVisualToVoxel(object, block.position);
          object.userData['voxel'] = block.position; object.userData['renderRole'] = role; object.userData['realModel'] = true; object.userData['renderMode'] = visual.mode; object.userData['renderTrace'] = visual.trace; object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
          object.traverse((child) => {
            child.userData['voxel'] = block.position; child.userData['renderRole'] = role; child.userData['realModel'] = true;
            if (child instanceof THREE.Mesh) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              for (const item of materials) { item.transparent = true; item.opacity = isReference ? options.referenceOpacity ?? .28 : 1; }
            }
          });
          this.blocksGroup.remove(mesh); mesh.geometry.dispose(); material.dispose(); this.blocksGroup.add(object); this.render();
        }).catch((error: unknown) => { mesh.userData['renderMode'] = 'fallback'; mesh.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown visual provider error' }]; this.render(); });
      }
    }
    this.setProjectBounds(project);
    this.setEditingPlane(options.layerY, project);
    this.updateSelection(options.selected, options.selectedPositions, options.selectionBox);
    this.updateActiveGroup(project, options.activeGroupId, options.activeGroupPositions);
    this.updateMovePreview(project, options.groupMovePreview);
    this.updateGhostModel(active, undefined);
    this.updateGhost(undefined, project, active);
    if (project && this.controls && !this.hasCameraFrame) this.resetCamera();
    this.render();
  }

  hit(event: PointerEvent, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    if (!this.renderer || !this.container || !project) return { status: 'invalid' };
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const blockHit = this.raycaster.intersectObjects(this.blocksGroup.children, true)[0];
    let target: VoxelCoordinate | undefined;
    let block: VoxelCoordinate | undefined;
    let faceNormal: FaceNormal | undefined;
    let hitPoint: THREE.Vector3 | undefined;
    if (planeY !== undefined && this.editingPlane) {
      const planeHit = this.raycaster.intersectObject(this.editingPlane, false)[0];
      if (planeHit) { target = targetFromEditingPlaneHit(planeHit.point, planeY, project.size); faceNormal = { x: 0, y: 1, z: 0 }; hitPoint = planeHit.point; }
    } else if (blockHit?.object.userData['voxel']) {
      block = blockHit.object.userData['voxel'] as VoxelCoordinate;
      const normal = (blockHit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().transformDirection(blockHit.object.matrixWorld);
      faceNormal = { x: normal.x, y: normal.y, z: normal.z };
      hitPoint = blockHit.point;
      const attachment = resolveAttachmentPlacement(active?.id, block, hitPoint, project.blocks);
      target = attachment?.target ?? targetFromBlockFace(block, normal as FaceNormal);
      if (attachment) faceNormal = { x: 0, y: attachment.snapType === 'chain-extension' ? 1 : -1, z: 0 };
    } else if (this.ground) {
      const groundHit = this.raycaster.intersectObject(this.ground, false)[0];
      if (groundHit) { target = targetFromGridHit(groundHit.point); faceNormal = { x: 0, y: 1, z: 0 }; hitPoint = groundHit.point; }
    }
    if (blockHit?.object.userData['voxel']) {
      const hitVoxel = blockHit.object.userData['voxel'] as VoxelCoordinate;
      if (planeY === undefined || hitVoxel.y === planeY) block = hitVoxel;
    }
    const facing = active?.state['facing'];
    const attachment = block && hitPoint ? resolveAttachmentPlacement(active?.id, block, hitPoint, project.blocks) : undefined;
    const placementContext = faceNormal ? { faceNormal, hitPoint: hitPoint ? { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } : undefined, facing: isHorizontalDirection(facing) ? facing : undefined, yaw: cameraYaw(this.camera), stateOverride: attachment?.stateOverride } : undefined;
    const plan = target && active && this.placementPlanProvider ? this.placementPlanProvider(project, active, target, placementContext) : undefined;
    const status = plan?.validation.status ?? placementStatus(target, project.size, active?.support ?? 'unknown');
    this.updateGhostModel(active, plan);
    this.updateGhost(showGhost ? target : undefined, project, active, status, plan);
    this.render();
    return { target, block, status, faceNormal, placementContext };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this.renderOnControlChange);
    this.controls?.dispose();
    document.removeEventListener('keydown', this.onCameraKeyDown); document.removeEventListener('keyup', this.onCameraKeyUp); document.removeEventListener('focusin', this.onWindowBlur); window.removeEventListener('blur', this.onWindowBlur); document.removeEventListener('visibilitychange', this.onVisibilityChange); this.clearInput();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    for (const child of this.blocksGroup.children) disposeObject(child);
    this.blocksGroup.clear();
    for (const child of [...this.logicalSelectionGroup.children]) { child.traverse((object) => { if (object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.logicalSelectionGroup.remove(child); }
    this.ghost.geometry.dispose();
    (this.ghost.material as THREE.Material).dispose();
    this.ground?.geometry.dispose();
    (this.ground?.material as THREE.Material | undefined)?.dispose();
    this.editingPlane?.geometry.dispose();
    (this.editingPlane?.material as THREE.Material | undefined)?.dispose();
    this.projectGrid?.geometry.dispose();
    (this.projectGrid?.material as THREE.Material | undefined)?.dispose();
    this.editingGrid?.geometry.dispose();
    (this.editingGrid?.material as THREE.Material | undefined)?.dispose();
    this.boundsBox?.geometry.dispose();
    (this.boundsBox?.material as THREE.Material | undefined)?.dispose();
    this.selectionOutline.geometry.dispose();
    (this.selectionOutline.material as THREE.Material).dispose();
    this.selectionBox.geometry.dispose();
    (this.selectionBox.material as THREE.Material).dispose();
    if (this.ghostModel) disposeObject(this.ghostModel);
    this.renderer = undefined;
    this.container = undefined;
  }

  diagnostics(): ViewportDiagnostics {
    return { initialized: !!this.renderer, disposed: this.disposed, canvasWidth: this.canvasSize.width, canvasHeight: this.canvasSize.height, gridExists: !!this.projectGrid, boundsExists: !!this.boundsBox, rendererExists: !!this.renderer, sceneExists: true, cameraExists: true, controlsExist: !!this.controls, themeApplied: this.themeApplied, resizeApplied: this.canvasSize.width > 0 && this.canvasSize.height > 0, renderMode: 'demand', renderCount: this.renderCount };
  }

  private setEditingPlane(y: number | undefined, project: ProjectDocument | undefined): void {
    if (!project || y === undefined) {
      if (this.editingPlane) this.editingPlane.visible = false;
      if (this.editingGrid) this.editingGrid.visible = false;
      return;
    }
    if (!this.editingPlane) {
      this.editingPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      this.editingPlane.rotation.x = -Math.PI / 2;
      this.scene.add(this.editingPlane);
    }
    this.editingGrid?.geometry.dispose();
    (this.editingGrid?.material as THREE.Material | undefined)?.dispose();
    if (this.editingGrid) this.scene.remove(this.editingGrid);
    this.editingGrid = createBoundedGrid(project.size.x, project.size.z, this.palette.editingGrid);
    this.scene.add(this.editingGrid);
    this.editingPlane.geometry.dispose();
    this.editingPlane.geometry = new THREE.PlaneGeometry(project.size.x, project.size.z);
    this.editingPlane.position.set(project.size.x / 2, y + 0.002, project.size.z / 2);
    this.editingPlane.visible = true;
    this.editingGrid.position.y = y + 0.004;
    this.editingGrid.visible = true;
  }

  clearGhost(): void { this.ghost.visible = false; if (this.ghostModel) this.ghostModel.visible = false; this.render(); }
  clearInput(): void { this.pressedKeys.clear(); if (this.cameraMoveFrame !== undefined) { cancelAnimationFrame(this.cameraMoveFrame); this.cameraMoveFrame = undefined; } }
  setGhostStatus(status: PlacementStatus): void {
    if (!this.ghost.visible) return;
    const material = this.ghost.material as THREE.MeshBasicMaterial;
    material.color.set(status === 'valid' ? 0x4bff9c : status === 'warning' ? 0xffc857 : status === 'unknown' ? 0xc2a5ff : 0xff526b);
    this.render();
  }

  cameraState(): CameraState | undefined {
    if (!this.controls) return undefined;
    return { position: vectorValue(this.camera.position), target: vectorValue(this.controls.target), up: vectorValue(this.camera.up) };
  }

  restoreCamera(state: CameraState | undefined): void {
    if (!state || !this.controls) return;
    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    this.camera.up.set(state.up.x, state.up.y, state.up.z);
    this.controls.target.set(state.target.x, state.target.y, state.target.z);
    this.controls.update();
    this.hasCameraFrame = true;
    this.render();
  }

  fitStructure(): void {
    const project = this.project;
    if (!project) return;
    const blocks = this.renderOptions.layerY === undefined || !this.renderOptions.visibility
      ? project.blocks
      : blocksForLayers(project.blocks, this.renderOptions.layerY, this.renderOptions.visibility);
    this.frameBounds(structureCameraBounds(blocks) ?? projectCameraBounds(project.size));
  }

  focusSelection(position: VoxelCoordinate | undefined): void {
    if (!position || !this.controls) return;
    const target = selectedVoxelCenter(position);
    const direction = this.camera.position.clone().sub(this.controls.target);
    const distance = Math.max(4, direction.length());
    this.setCamera(target, direction.lengthSq() ? direction.normalize() : perspectiveDirection(), distance);
  }

  resetCamera(): void {
    if (!this.project) return;
    this.hasCameraFrame = true;
    this.frameBounds(projectCameraBounds(this.project.size));
  }

  setCameraPreset(preset: CameraPreset): void {
    if (!this.controls) return;
    const distance = Math.max(4, this.camera.position.distanceTo(this.controls.target));
    const direction = presetDirection(preset);
    this.setCamera(vectorValue(this.controls.target), direction, distance, preset === 'top' ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 });
  }

  private setProjectBounds(project: ProjectDocument | undefined): void {
    const size = project?.size ?? VIEWPORT_BOOTSTRAP_SIZE;
    const bounds = projectGridBounds(size);
    this.projectGrid?.geometry.dispose();
    (this.projectGrid?.material as THREE.Material | undefined)?.dispose();
    if (this.projectGrid) this.scene.remove(this.projectGrid);
    this.projectGrid = createBoundedGrid(size.x, size.z, this.palette.grid);
    this.scene.add(this.projectGrid);
    this.boundsBox?.geometry.dispose();
    (this.boundsBox?.material as THREE.Material | undefined)?.dispose();
    if (this.boundsBox) this.scene.remove(this.boundsBox);
    this.boundsBox = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z), new THREE.Vector3(bounds.maxEdge.x, bounds.maxEdge.y, bounds.maxEdge.z)), this.palette.bounds);
    this.scene.add(this.boundsBox);
    if (!this.ground) {
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      this.ground.rotation.x = -Math.PI / 2;
      this.scene.add(this.ground);
    }
    this.ground.geometry.dispose();
    this.ground.geometry = new THREE.PlaneGeometry(size.x, size.z);
    this.ground.position.set(size.x / 2, 0, size.z / 2);
    this.ground.visible = true;
  }

  private updateSelection(selected: VoxelCoordinate | undefined, selectedPositions: readonly VoxelCoordinate[] | undefined, box: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined): void {
    for (const child of [...this.logicalSelectionGroup.children]) { child.traverse((object) => { if (object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.logicalSelectionGroup.remove(child); }
    this.selectionOutline.visible = !!selected && !selectedPositions?.length;
    if (selected) this.selectionOutline.position.set(selected.x + .5, selected.y + .5, selected.z + .5);
    (this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(this.palette.selection);
    (this.selectionBox.material as THREE.LineBasicMaterial).color.setHex(this.palette.selection);
    for (const position of selectedPositions ?? []) { const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: this.palette.selection })); outline.position.set(position.x + .5, position.y + .5, position.z + .5); outline.renderOrder = 1001; this.logicalSelectionGroup.add(outline); }
    this.selectionBox.visible = !!box;
    if (box) this.selectionBox.box.set(new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x + 1, box.max.y + 1, box.max.z + 1));
  }

  private updateActiveGroup(project: ProjectDocument | undefined, activeGroupId: string | undefined, positions: readonly VoxelCoordinate[] | undefined): void {
    for (const child of [...this.scene.children]) {
      if (child.userData['groupHighlight']) { child.traverse((object) => { if (object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.scene.remove(child); }
    }
    if (!project || !activeGroupId) return;
    const group = project.groups.find((entry) => entry.id === activeGroupId);
    const color = group?.locked ? this.palette.lockedGroup : this.palette.group;
    const positionKeys = new Set(positions?.map((position) => `${position.x},${position.y},${position.z}`));
    const isolatedKeys = new Set(this.renderOptions.isolatedGroupPositions?.map((position) => `${position.x},${position.y},${position.z}`));
    for (const block of project.blocks.filter((entry) => positionKeys.has(`${entry.position.x},${entry.position.y},${entry.position.z}`) && isBlockVisible(entry, project.groups) && (!this.renderOptions.isolatedGroupId || isolatedKeys.has(`${entry.position.x},${entry.position.y},${entry.position.z}`)))) {
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.12, 1.12, 1.12)), new THREE.LineBasicMaterial({ color }));
      outline.position.set(block.position.x + .5, block.position.y + .5, block.position.z + .5);
      outline.userData['groupHighlight'] = true;
      outline.userData['groupLocked'] = !!group?.locked;
      outline.renderOrder = 1000;
      this.scene.add(outline);
    }
  }

  private updateMovePreview(project: ProjectDocument | undefined, preview: GroupMovePreview | undefined): void {
    for (const child of [...this.movePreviewGroup.children]) { child.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.movePreviewGroup.remove(child); }
    if (!project || !preview || !preview.offset.x && !preview.offset.y && !preview.offset.z) return;
    const color = preview.valid ? this.palette.valid : this.palette.invalid;
    const movingKeys = new Set(preview.positions.map((position) => `${position.x},${position.y},${position.z}`));
    for (const block of project.blocks.filter((entry) => movingKeys.has(`${entry.position.x},${entry.position.y},${entry.position.z}`))) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .42, wireframe: true, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.position.set(block.position.x + preview.offset.x + .5, block.position.y + preview.offset.y + .5, block.position.z + preview.offset.z + .5);
      mesh.renderOrder = 1002;
      mesh.userData['previewInvalid'] = !preview.valid;
      this.movePreviewGroup.add(mesh);
    }
  }

  private updateGhost(target: VoxelCoordinate | undefined, project: ProjectDocument | undefined, active: ActiveBlock | undefined, status: PlacementStatus = 'invalid', plan?: PlacementPlan): void {
    this.ghostTarget = target;
    if (!target || !project || !active) { this.ghost.visible = false; if (this.ghostModel) this.ghostModel.visible = false; return; }
    this.ghost.visible = true;
    this.positionGhostOutline(target);
    const material = this.ghost.material as THREE.MeshBasicMaterial;
    material.color.setHex(colorForStatus(this.palette, status));
    material.depthTest = false;
    material.depthWrite = false;
    material.wireframe = true;
    this.ghost.renderOrder = 1000;
    this.ghost.userData['activeBlock'] = { id: active.id, state: { ...active.state }, status, blocks: plan?.blocks.map((block) => ({ id: block.id, position: block.position, state: block.state })) };
    this.ghost.userData['status'] = status;
    if (this.ghostModel) { this.ghostModel.position.set(target.x, target.y, target.z); this.ghostModel.visible = true; }
  }

  private updateGhostModel(active: ActiveBlock | undefined, plan?: PlacementPlan): void {
    const key = active ? `${active.id}|${JSON.stringify(active.state)}|${plan?.blocks.map((block) => `${block.id}@${block.position.x},${block.position.y},${block.position.z}|${JSON.stringify(block.state)}`).join(';') ?? ''}` : '';
    if (key === this.ghostModelKey) return;
    this.ghostModelKey = key; const generation = ++this.ghostGeneration;
    if (this.ghostModel) { this.scene.remove(this.ghostModel); disposeObject(this.ghostModel); this.ghostModel = undefined; }
    this.setGhostOutlineBounds();
    if (!active || !this.visualProvider) return;
    const blocks = plan?.blocks.length ? plan.blocks : active ? [{ kind: 'resolved' as const, id: active.id, namespace: active.id.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state: active.state }] : [];
    void Promise.all(blocks.map(async (block) => ({ block, visual: await this.visualProvider!.create({ ...block, position: { x: 0, y: 0, z: 0 } }) }))).then((results) => {
      if (generation !== this.ghostGeneration || !results.length) return;
      const root = new THREE.Group();
      for (const { block, visual } of results) {
        if (!visual.object) continue;
        visual.object.position.set(visual.object.position.x + block.position.x - (plan?.request.position.x ?? 0), visual.object.position.y + block.position.y - (plan?.request.position.y ?? 0), visual.object.position.z + block.position.z - (plan?.request.position.z ?? 0));
        root.add(visual.object);
      }
      if (!root.children.length) return;
      this.ghostModel = root; this.ghostModel.visible = false; this.ghostModel.renderOrder = 999;
      this.ghostModel.traverse((child) => { if (child instanceof THREE.Mesh) { const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const material of materials) { material.transparent = true; material.opacity = .52; material.depthWrite = false; } } });
      this.scene.add(this.ghostModel);
      const bounds = new THREE.Box3().setFromObject(this.ghostModel); this.setGhostOutlineBounds(bounds);
      if (this.ghostTarget) { this.ghostModel.position.set(this.ghostTarget.x, this.ghostTarget.y, this.ghostTarget.z); this.ghostModel.visible = this.ghost.visible; this.positionGhostOutline(this.ghostTarget); }
      this.render();
    }).catch((error: unknown) => { this.ghost.userData['renderMode'] = 'fallback'; this.ghost.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown ghost visual provider error' }]; this.render(); });
  }

  private setGhostOutlineBounds(bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))): void {
    const size = bounds.getSize(new THREE.Vector3()); bounds.getCenter(this.ghostBoundsCenter);
    this.ghost.geometry.dispose(); this.ghost.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  }

  private positionGhostOutline(target: VoxelCoordinate): void {
    this.ghost.position.set(target.x + this.ghostBoundsCenter.x, target.y + this.ghostBoundsCenter.y, target.z + this.ghostBoundsCenter.z);
  }

  private frameBounds(bounds: ReturnType<typeof projectCameraBounds>): void {
    const target = cameraBoundsCenter(bounds);
    const distance = cameraDistanceForBounds(bounds, this.camera.fov, this.camera.aspect);
    this.setCamera(target, perspectiveDirection(), distance);
  }

  private setCamera(target: CameraVector, direction: THREE.Vector3, distance: number, up: CameraVector = { x: 0, y: 1, z: 0 }): void {
    if (!this.controls) return;
    this.camera.up.set(up.x, up.y, up.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.camera.position.set(target.x, target.y, target.z).addScaledVector(direction, distance);
    this.controls.update();
    this.render();
  }

  private render(): void { if (this.renderer) { this.renderer.render(this.scene, this.camera); this.renderCount++; } }

  private startCameraMovement(): void { if (this.cameraMoveFrame !== undefined) return; let previous = performance.now(); const step = (now: number) => { this.cameraMoveFrame = undefined; const delta = Math.min((now - previous) / 1000, .1); previous = now; this.moveCamera(this.pressedKeys, delta); if (this.pressedKeys.size) this.cameraMoveFrame = requestAnimationFrame(step); }; this.cameraMoveFrame = requestAnimationFrame(step); }
  private moveCamera(keys: ReadonlySet<string>, delta: number): void {
    if (!this.controls || !keys.size) return; const direction = cameraMovementDirection(keys, this.camera); if (!direction.lengthSq()) return; direction.normalize().multiplyScalar(delta * 9); this.camera.position.add(direction); this.controls.target.add(direction); this.controls.update();
  }
}

function cameraYaw(camera: THREE.Camera): number {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  return THREE.MathUtils.radToDeg(Math.atan2(-forward.x, forward.z));
}

function vectorValue(vector: THREE.Vector3): CameraVector { return { x: vector.x, y: vector.y, z: vector.z }; }
function perspectiveDirection(): THREE.Vector3 { return new THREE.Vector3(1, .75, 1).normalize(); }
function presetDirection(preset: CameraPreset): THREE.Vector3 {
  switch (preset) {
    case 'top': return new THREE.Vector3(0, 1, 0);
    case 'front': return new THREE.Vector3(0, 0, 1);
    case 'back': return new THREE.Vector3(0, 0, -1);
    case 'left': return new THREE.Vector3(-1, 0, 0);
    case 'right': return new THREE.Vector3(1, 0, 0);
    case 'perspective': return perspectiveDirection();
  }
}

function createBoundedGrid(sizeX: number, sizeZ: number, color: number): THREE.LineSegments {
  const points: THREE.Vector3[] = [];
  for (let x = 0; x <= sizeX; x++) points.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 0, sizeZ));
  for (let z = 0; z <= sizeZ; z++) points.push(new THREE.Vector3(0, 0, z), new THREE.Vector3(sizeX, 0, z));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .72 }));
}

function colorForStatus(palette: ViewportThemePalette, status: PlacementStatus): number {
  switch (status) {
    case 'valid': return palette.valid;
    case 'warning': return palette.warning;
    case 'unknown': return palette.unknown;
    default: return palette.invalid;
  }
}
function isHorizontalDirection(value: string | undefined): value is 'north' | 'east' | 'south' | 'west' { return value === 'north' || value === 'east' || value === 'south' || value === 'west'; }
const cameraMovementCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']);
export function cameraMovementDirection(keys: ReadonlySet<string>, camera: THREE.Camera): THREE.Vector3 {
  const forward = camera.getWorldDirection(new THREE.Vector3()); forward.y = 0; if (forward.lengthSq() === 0) return new THREE.Vector3(); forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize(); const direction = new THREE.Vector3();
  if (keys.has('KeyW')) direction.add(forward); if (keys.has('KeyS')) direction.sub(forward); if (keys.has('KeyD')) direction.add(right); if (keys.has('KeyA')) direction.sub(right); if (keys.has('Space')) direction.y += 1; if (keys.has('ShiftLeft') || keys.has('ShiftRight')) direction.y -= 1;
  return direction;
}
function isTextInput(target: EventTarget | null): boolean { const element = target as HTMLElement | null; return !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable); }
function disposeObject(object: THREE.Object3D): void { object.traverse((child) => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const material of materials) { if (material.map?.userData['ownedBedAtlasTexture'] || material.map?.userData['ownedSignTexture']) material.map.dispose(); material.dispose(); } } }); }

export function applyBlockTheme(root: THREE.Object3D, palette: ViewportThemePalette): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData['realModel']) return;
    const material = object.material as THREE.MeshLambertMaterial;
    const role = object.userData['renderRole'];
    if (role === 'missing') material.color.setHex(palette.missingBlock);
    else if (role === 'reference') material.color.setHex(palette.referenceBlock);
    else material.color.setHex(palette.block);
  });
}
