import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { FaceNormal, resolveAttachmentPlacement, placementStatus, projectGridBounds, targetFromBlockFace, targetFromEditingPlaneHit, targetFromGridHit, PlacementContext, PlacementStatus } from '../../editor/placement/placement';
import { blocksForLayers, YLayerVisibility } from '../../editor/viewport/y-layer';
import { cameraBoundsCenter, cameraDistanceForBounds, CameraBounds, CameraPreset, CameraState, CameraVector, projectCameraBounds, structureCameraBounds } from '../../editor/camera/camera';
import { isBlockVisible } from '../../editor/groups/group-membership';
import { isDecorationVisible, decorationHasGroup } from '../../editor/groups/decoration-membership';
import { GroupMovePreview } from '../../editor/groups/group.service';
import { ViewportThemePalette, viewportThemePalette } from './viewport-theme';
import { BlockVisualProvider, VisualCacheStats } from '../geometry/block-model-geometry';
import type { ResolvedItemVisual } from '../geometry/block-model-geometry';
import type { NormalizedSpecialVisualDescriptor } from '../visuals/special-block-visuals';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedDecoration } from '../../decorations/decoration.types';
import { DecorationPlacementPlan, decorationAabb, facingFromNormal, planDecorationPlacement } from '../../decorations/placement/decoration-placement';
import { createDecorationVisual, DecorationTextureCache } from '../visuals/decoration-visuals';
import type { ActiveDecoration } from '../../decorations/decoration.service';
import { DEFAULT_KEYBINDINGS, KeyboardAction, keyboardActionForEvent } from '../../editor/input/keyboard-bindings';
import { DEFAULT_MOUSE_BINDINGS, MouseAction, mouseActionForEvent } from '../../editor/input/mouse-bindings';
import { RendererDiagnostics, RendererCounters } from './renderer-diagnostics';
import { normalizeBlockBrightness, viewportLightingForBrightness, ViewportLighting } from './viewport-lighting';

export interface ViewportHit { readonly target?: VoxelCoordinate; readonly status: PlacementStatus; readonly block?: VoxelCoordinate; readonly faceNormal?: FaceNormal; readonly placementContext?: PlacementContext; readonly decoration?: PlacedDecoration; readonly decorationPlan?: DecorationPlacementPlan; readonly decorationDistance?: number; readonly blockDistance?: number; }
type PlacementPlanProvider = (project: ProjectDocument, active: ActiveBlock, target: VoxelCoordinate, context: PlacementContext | undefined) => PlacementPlan | undefined;
export interface ViewportRenderOptions { readonly layerY?: number; readonly visibility?: YLayerVisibility; readonly referenceOpacity?: number; readonly selected?: VoxelCoordinate; readonly selectedPositions?: readonly VoxelCoordinate[]; readonly selectedDecorationId?: string; readonly activeDecoration?: ActiveDecoration; readonly selectionBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly isolatedGroupId?: string; readonly isolatedGroupPositions?: readonly VoxelCoordinate[]; readonly activeGroupId?: string; readonly activeGroupPositions?: readonly VoxelCoordinate[]; readonly groupMovePreview?: GroupMovePreview; }
export interface ViewportDiagnostics { readonly initialized: boolean; readonly disposed: boolean; readonly canvasWidth: number; readonly canvasHeight: number; readonly gridExists: boolean; readonly boundsExists: boolean; readonly rendererExists: boolean; readonly sceneExists: true; readonly cameraExists: true; readonly controlsExist: boolean; readonly themeApplied: boolean; readonly resizeApplied: boolean; readonly renderMode: 'demand'; readonly renderCount: number; }

export interface ViewportControlConfiguration {
  readonly orbitSensitivity: number;
  readonly panSensitivity: number;
  readonly zoomSensitivity: number;
  readonly cameraMoveSpeed: number;
  readonly verticalMoveSpeed: number;
}

interface RenderedBlockEntry {
  readonly key: string;
  readonly block: ProjectDocument['blocks'][number];
  readonly signature: string;
  readonly role: 'normal' | 'reference' | 'missing';
  readonly fallback: THREE.Mesh;
  revision: number;
  object: THREE.Object3D;
}

interface RenderedDecorationEntry {
  readonly id: string;
  readonly decoration: PlacedDecoration;
  readonly signature: string;
  readonly object: THREE.Object3D;
}

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
  private readonly decorationsGroup = new THREE.Group();
  private readonly ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x4b9cff, transparent: true, opacity: 0.35 }));
  private readonly selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffd166 }));
  private readonly selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
  private readonly movePreviewGroup = new THREE.Group();
  private readonly decorationGhostGroup = new THREE.Group();
  private readonly decorationSelectionGroup = new THREE.Group();
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
  private cameraMoveFrame?: number;
  private readonly pressedActions = new Set<KeyboardAction>();
  private keyboardBindings: Readonly<Record<KeyboardAction, string>> = DEFAULT_KEYBINDINGS;
  private mouseBindings: Readonly<Record<MouseAction, string>> = DEFAULT_MOUSE_BINDINGS;
  private readonly onCameraKeyDown = (event: KeyboardEvent) => { if (isTextInput(event.target) || isDialogTarget(event.target)) { this.clearInput(); return; } const action = keyboardActionForEvent(event, this.keyboardBindings); if (!isMovementAction(action)) return; event.preventDefault(); this.pressedActions.add(action); this.startCameraMovement(); };
  private readonly onCameraKeyUp = (event: KeyboardEvent) => { const action = keyboardActionForEvent(event, this.keyboardBindings); if (isMovementAction(action)) this.pressedActions.delete(action); };
  private readonly onWindowBlur = () => this.clearInput();
  private readonly onVisibilityChange = () => { if (document.hidden) this.clearInput(); };
  private readonly onCanvasPointerDownCapture = (event: PointerEvent) => {
    const action = mouseActionForEvent(event, this.mouseBindings);
    if (!action || !this.controls) return;
    const key = event.button === 0 ? 'LEFT' : event.button === 1 ? 'MIDDLE' : event.button === 2 ? 'RIGHT' : undefined;
    if (!key) return;
    const mapped = this.controls.mouseButtons[key];
    if (action === 'orbit-camera' || action === 'pan-camera') {
      if (mapped === undefined) { this.temporaryMouseButton = { key, previous: mapped }; this.controls.mouseButtons[key] = action === 'orbit-camera' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN; }
      return;
    }
    if (mapped !== undefined) { event.preventDefault(); this.temporaryMouseButton = { key, previous: mapped }; delete this.controls.mouseButtons[key]; }
  };
  private readonly onCanvasPointerUpCapture = () => { this.restoreTemporaryMouseButton(); };
  private readonly onCanvasWheelCapture = (event: WheelEvent) => {
    const action = mouseActionForEvent(event, this.mouseBindings);
    if (action !== 'zoom-in' && action !== 'zoom-out') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    event.preventDefault(); event.stopImmediatePropagation(); this.applyWheelZoom(action);
  };
  private temporaryMouseButton?: { readonly key: 'LEFT' | 'MIDDLE' | 'RIGHT'; readonly previous: THREE.MOUSE | null | undefined };
  private palette: ViewportThemePalette = viewportThemePalette('dark');
  private visualProvider?: BlockVisualProvider;
  private decorationTextureUrl?: (resource: string) => string | undefined;
  private decorationItemResources?: (itemId: string) => readonly string[];
  private decorationItemVisual?: (itemId: string) => ResolvedItemVisual | undefined;
  private paintingResource?: (variantId: string) => string | undefined;
  private specialVisualResolver?: (blockId: string) => ContentSpecialVisualDescriptor | undefined;
  private definitionResolver?: (blockId: string) => BlockDefinition | undefined;
  private decorationTextureCache?: DecorationTextureCache;
  private placementPlanProvider?: PlacementPlanProvider;
  private ghostGeneration = 0;
  private disposed = false;
  private renderCount = 0;
  private canvasSize = { width: 0, height: 0 };
  private themeApplied = false;
  private controlConfiguration: ViewportControlConfiguration = { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 1, cameraMoveSpeed: 9, verticalMoveSpeed: 9 };
  private readonly renderedBlocks = new Map<string, RenderedBlockEntry>();
  private readonly renderedDecorations = new Map<string, RenderedDecorationEntry>();
  private hemisphereLight?: THREE.HemisphereLight;
  private keyLight?: THREE.DirectionalLight;
  private blockBrightness = 3;
  private structureSyncKey = '';
  private syncedProject?: ProjectDocument;
  private providerGeneration = 0;
  private providerStats?: VisualCacheStats;

  constructor(readonly instrumentation = new RendererDiagnostics()) {}

  mount(container: HTMLElement): void {
    if (this.disposed) return;
    if (this.renderer) { this.resize(); return; }
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.applyTheme(this.palette);
    this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x394454, 1);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1); this.keyLight.position.set(6, 10, 7);
    this.scene.add(this.hemisphereLight, this.keyLight);
    this.applyBlockBrightness();
    this.scene.add(this.blocksGroup);
    this.scene.add(this.decorationsGroup);
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
    this.scene.add(this.decorationGhostGroup);
    this.scene.add(this.decorationSelectionGroup);
    this.camera.position.set(12, 10, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    delete this.controls.mouseButtons.LEFT;
    this.controls.enableZoom = false;
    this.controls.enablePan = true;
    this.applyControlConfiguration();
    this.applyMouseBindings();
    this.controls.addEventListener('change', this.renderOnControlChange);
    this.renderer.domElement.addEventListener('pointerdown', this.onCanvasPointerDownCapture, true);
    this.renderer.domElement.addEventListener('pointerup', this.onCanvasPointerUpCapture, true);
    this.renderer.domElement.addEventListener('pointercancel', this.onCanvasPointerUpCapture, true);
    this.renderer.domElement.addEventListener('wheel', this.onCanvasWheelCapture, { capture: true, passive: false });
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

  setBlockBrightness(value: number): void {
    this.blockBrightness = normalizeBlockBrightness(value);
    this.applyBlockBrightness();
    if (this.renderer) this.render();
  }

  lighting(): ViewportLighting { return viewportLightingForBrightness(this.blockBrightness); }

  private applyBlockBrightness(): void {
    const lighting = viewportLightingForBrightness(this.blockBrightness);
    if (this.hemisphereLight) this.hemisphereLight.intensity = lighting.hemisphereIntensity;
    if (this.keyLight) this.keyLight.intensity = lighting.directionalIntensity;
  }

  setControlConfiguration(configuration: ViewportControlConfiguration): void {
    this.controlConfiguration = { ...configuration };
    this.applyControlConfiguration();
  }

  setKeyboardBindings(bindings: Readonly<Record<KeyboardAction, string>>): void {
    this.keyboardBindings = { ...bindings };
    this.pressedActions.clear();
  }

  setMouseBindings(bindings: Readonly<Record<MouseAction, string>>): void {
    this.mouseBindings = { ...bindings };
    this.applyMouseBindings();
  }

  private applyControlConfiguration(): void {
    if (!this.controls) return;
    this.controls.rotateSpeed = this.controlConfiguration.orbitSensitivity;
    this.controls.panSpeed = this.controlConfiguration.panSensitivity;
    this.controls.zoomSpeed = this.controlConfiguration.zoomSensitivity;
  }

  private applyMouseBindings(): void {
    if (!this.controls) return;
    delete this.controls.mouseButtons.LEFT;
    delete this.controls.mouseButtons.MIDDLE;
    delete this.controls.mouseButtons.RIGHT;
    const orbit = this.unmodifiedMouseButton('orbit-camera');
    const pan = this.unmodifiedMouseButton('pan-camera');
    if (orbit === 'LeftClick') this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    if (orbit === 'MiddleClick') this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    if (orbit === 'RightClick') this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    if (pan === 'LeftClick') this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    if (pan === 'MiddleClick') this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    if (pan === 'RightClick') this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  }

  private restoreTemporaryMouseButton(): void {
    if (!this.controls || !this.temporaryMouseButton) return;
    const { key, previous } = this.temporaryMouseButton;
    if (previous === undefined) delete this.controls.mouseButtons[key];
    else this.controls.mouseButtons[key] = previous;
    this.temporaryMouseButton = undefined;
  }

  private unmodifiedMouseButton(action: MouseAction): string | undefined {
    const binding = this.mouseBindings[action].split('|').find((value) => !value.includes('+'));
    return binding;
  }

  private applyWheelZoom(action: 'zoom-in' | 'zoom-out'): void {
    if (!this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = offset.length();
    const zoomScale = Math.pow(.95, this.controlConfiguration.zoomSensitivity);
    const factor = action === 'zoom-in' ? zoomScale : 1 / zoomScale;
    const nextDistance = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, distance * factor));
    if (distance > 0) this.camera.position.copy(this.controls.target).add(offset.normalize().multiplyScalar(nextDistance));
    this.controls.update();
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
    this.providerStats = undefined;
    this.providerGeneration += 1;
    this.structureSyncKey = '';
    this.ghostModelKey = '';
    if (provider) this.syncSpecialVisualDescriptors();
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setSpecialVisualDescriptorResolver(resolver: ((blockId: string) => ContentSpecialVisualDescriptor | undefined) | undefined): void {
    this.specialVisualResolver = resolver;
    this.syncSpecialVisualDescriptors();
    this.structureSyncKey = '';
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationTextureProvider(provider: ((resource: string) => string | undefined) | undefined): void {
    if (provider === this.decorationTextureUrl) return;
    this.decorationTextureCache?.dispose();
    this.decorationTextureCache = provider ? new DecorationTextureCache(provider, undefined, () => this.render()) : undefined;
    this.decorationTextureUrl = provider;
    this.structureSyncKey = '';
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemResourceProvider(provider: ((itemId: string) => readonly string[]) | undefined): void {
    if (provider === this.decorationItemResources) return;
    this.decorationItemResources = provider;
    this.structureSyncKey = '';
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemVisualProvider(provider: ((itemId: string) => ResolvedItemVisual | undefined) | undefined): void {
    if (provider === this.decorationItemVisual) return;
    this.decorationItemVisual = provider;
    this.structureSyncKey = '';
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setPaintingTextureResolver(provider: ((variantId: string) => string | undefined) | undefined): void {
    if (provider === this.paintingResource) return;
    this.paintingResource = provider;
    this.structureSyncKey = '';
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  setPlacementPlanProvider(provider: PlacementPlanProvider | undefined): void { this.placementPlanProvider = provider; }
  setBlockDefinitionResolver(resolver: ((blockId: string) => BlockDefinition | undefined) | undefined): void { this.definitionResolver = resolver; }

  private collectSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): readonly NormalizedSpecialVisualDescriptor[] {
    const ids = new Set([...(this.project?.blocks ?? []).map((block) => block.id), ...(this.activeBlock ? [this.activeBlock.id] : []), ...plannedBlocks.map((block) => block.id)]);
    return [...ids].flatMap((id) => { const descriptor = this.specialVisualResolver?.(id); return descriptor ? [{ ...descriptor, contentId: id }] : []; });
  }
  private syncSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): void {
    this.visualProvider?.setSpecialVisualDescriptors?.(this.collectSpecialVisualDescriptors(plannedBlocks));
  }

  update(project: ProjectDocument | undefined, active: ActiveBlock | undefined, options: ViewportRenderOptions = {}): void {
    this.project = project;
    this.activeBlock = active;
    this.renderOptions = options;
    this.syncSpecialVisualDescriptors();
    const syncKey = project ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${renderFilterKey(options)}|${this.providerGeneration}` : 'empty';
    const persistentInputChanged = project !== this.syncedProject || syncKey !== this.structureSyncKey;
    const full = syncKey !== this.structureSyncKey;
    if (persistentInputChanged) {
      this.structureSyncKey = syncKey;
      this.syncedProject = project;
      this.reconcileStructure(project, options, full);
    }
    this.setProjectBounds(project);
    this.setEditingPlane(options.layerY, project);
    this.updateSelection(options.selected, options.selectedPositions, options.selectionBox);
    this.updateActiveGroup(project, options.activeGroupId, options.activeGroupPositions);
    this.updateMovePreview(project, options.groupMovePreview);
    this.updateGhostModel(active, undefined);
    this.clearDecorationGhost();
    this.updateDecorationSelection(options.selectedDecorationId);
    this.updateGhost(undefined, project, active);
    this.recordProviderCacheStats();
    if (project && this.controls && !this.hasCameraFrame) this.resetCamera();
    this.render();
  }

  private reconcileStructure(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean): void {
    if (!project) {
      this.clearPersistentVisuals();
      return;
    }
    const worldBlocks = new Map(project.blocks.map((block) => [coordinateKey(block.position), block] as const));
    const worldContext = { getBlock: (position: VoxelCoordinate) => worldBlocks.get(coordinateKey(position)) };
    const visible = this.visibleBlocks(project, options);
    const visibleMap = new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    if (full) this.instrumentation.record('fullSceneRebuilds');
    const changed = new Set<string>();
    for (const [key, entry] of this.renderedBlocks) if (!visibleMap.has(key)) { this.removeBlockEntry(key, entry); this.instrumentation.record('blockRemovals'); }
    for (const [key, entry] of visibleMap) {
      const current = this.renderedBlocks.get(key);
      if (full || !current || current.signature !== entry.signature || current.role !== entry.role) changed.add(key);
    }
    if (!full) for (const key of [...changed]) {
      const position = visibleMap.get(key)?.block.position ?? this.renderedBlocks.get(key)?.block.position;
      if (!position) continue;
      for (const neighbor of neighborPositions(position)) { const neighborKey = coordinateKey(neighbor); if (visibleMap.has(neighborKey)) changed.add(neighborKey); }
    }
    for (const key of changed) {
      const next = visibleMap.get(key); if (!next) continue;
      const previous = this.renderedBlocks.get(key);
      if (previous) { this.removeBlockEntry(key, previous); this.instrumentation.record('blockUpdates'); }
      else this.instrumentation.record('blockAdds');
      this.createBlockEntry(next.block, next.role, worldContext, options);
    }
    this.reconcileDecorations(project, options, full);
  }

  private visibleBlocks(project: ProjectDocument, options: ViewportRenderOptions): readonly { readonly block: ProjectDocument['blocks'][number]; readonly role: 'normal' | 'reference' | 'missing'; readonly signature: string }[] {
    const layered = options.layerY === undefined || !options.visibility ? project.blocks : blocksForLayers(project.blocks, options.layerY, options.visibility);
    const isolatedKeys = new Set(options.isolatedGroupPositions?.map((position) => coordinateKey(position)));
    return layered.filter((block) => isBlockVisible(block, project.groups) && (!options.isolatedGroupId || isolatedKeys.has(coordinateKey(block.position)))).map((block) => {
      const role = block.kind === 'missing' ? 'missing' : options.layerY !== undefined && block.position.y !== options.layerY ? 'reference' : 'normal';
      return { block, role, signature: `${stableValue(block)}|${role}|${options.referenceOpacity ?? .28}` };
    });
  }

  private createBlockEntry(block: ProjectDocument['blocks'][number], role: RenderedBlockEntry['role'], worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined }, options: ViewportRenderOptions): void {
    this.instrumentation.record('blockVisualCreations');
    this.instrumentation.record('fallbackGeometryConstructions');
    this.instrumentation.record('fallbackMaterialCreations');
    const isReference = role === 'reference';
    const material = new THREE.MeshLambertMaterial({ color: role === 'missing' ? this.palette.missingBlock : isReference ? this.palette.referenceBlock : this.palette.block, transparent: isReference, opacity: isReference ? options.referenceOpacity ?? .28 : 1 });
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    fallback.position.set(block.position.x + .5, block.position.y + .5, block.position.z + .5);
    fallback.userData['voxel'] = block.position; fallback.userData['renderRole'] = role;
    const entry: RenderedBlockEntry = { key: coordinateKey(block.position), block, signature: `${stableValue(block)}|${role}|${options.referenceOpacity ?? .28}`, role, fallback, revision: 0, object: fallback };
    this.renderedBlocks.set(entry.key, entry); this.blocksGroup.add(fallback);
    if (this.visualProvider && block.kind !== 'missing') {
      const generation = this.providerGeneration; const revision = ++entry.revision;
      this.instrumentation.record('modelResolutions');
      void this.visualProvider.create(block, worldContext).then((visual) => {
        if (generation !== this.providerGeneration || this.renderedBlocks.get(entry.key) !== entry || entry.revision !== revision || fallback.parent !== this.blocksGroup) { if (visual.object) disposeObject(visual.object); return; }
        fallback.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics]; fallback.userData['resolvedSupport'] = visual.resolved.support; fallback.userData['renderMode'] = visual.mode; fallback.userData['renderTrace'] = visual.trace;
        if (!visual.object) return;
        const object = visual.object; translateVisualToVoxel(object, block.position);
        object.userData['voxel'] = block.position; object.userData['renderRole'] = role; object.userData['realModel'] = true; object.userData['renderMode'] = visual.mode; object.userData['renderTrace'] = visual.trace; object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
        object.traverse((child) => { child.userData['voxel'] = block.position; child.userData['renderRole'] = role; child.userData['realModel'] = true; if (child instanceof THREE.Mesh) { const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const item of materials) { item.transparent = true; item.opacity = isReference ? options.referenceOpacity ?? .28 : 1; } } });
        this.blocksGroup.remove(fallback); fallback.geometry.dispose(); (fallback.material as THREE.Material).dispose(); this.blocksGroup.add(object); entry.object = object; this.recordProviderCacheStats(); this.render();
      }).catch((error: unknown) => { if (this.renderedBlocks.get(entry.key) !== entry || entry.revision !== revision) return; fallback.userData['renderMode'] = 'fallback'; fallback.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown visual provider error' }]; this.recordProviderCacheStats(); this.render(); });
    }
  }

  private removeBlockEntry(key: string, entry: RenderedBlockEntry): void { entry.revision += 1; if (entry.object.parent === this.blocksGroup) this.blocksGroup.remove(entry.object); if (entry.object !== entry.fallback) disposeObject(entry.object); else disposeObject(entry.fallback); this.renderedBlocks.delete(key); }

  private recordProviderCacheStats(): void {
    const stats = this.visualProvider?.cacheStats?.(); if (!stats) return;
    const previous = this.providerStats;
    for (const key of ['resolvedModelCacheHits', 'resolvedModelCacheMisses', 'geometryCacheHits', 'geometryCacheMisses', 'textureCacheHits', 'textureCacheMisses'] as const) this.instrumentation.record(key, Math.max(0, stats[key] - (previous?.[key] ?? 0)));
    this.providerStats = stats;
  }

  private clearPersistentVisuals(): void { for (const [key, entry] of this.renderedBlocks) this.removeBlockEntry(key, entry); for (const [key, entry] of this.renderedDecorations) this.removeDecorationEntry(key, entry); this.structureSyncKey = ''; this.syncedProject = undefined; }

  private reconcileDecorations(project: ProjectDocument, options: ViewportRenderOptions, full: boolean): void {
    const visible = (project.decorations ?? []).filter((decoration) => isDecorationVisible(decoration, project.groups) && (!options.isolatedGroupId || decorationHasGroup(decoration, options.isolatedGroupId)) && (options.layerY === undefined || decoration.anchor.y === options.layerY || options.visibility === 'whole-structure' || options.visibility === 'all-below' && decoration.anchor.y <= (options.layerY ?? decoration.anchor.y)));
    const map = new Map(visible.map((decoration) => [decoration.instanceId, decoration] as const));
    for (const [id, entry] of this.renderedDecorations) if (!map.has(id)) { this.removeDecorationEntry(id, entry); this.instrumentation.record('decorationRemovals'); }
    for (const [id, decoration] of map) {
      const signature = stableValue(decoration); const current = this.renderedDecorations.get(id);
      if (!full && current?.signature === signature) continue;
      if (current) { this.removeDecorationEntry(id, current); this.instrumentation.record('decorationUpdates'); } else this.instrumentation.record('decorationAdds');
      this.instrumentation.record('decorationVisualCreations');
      const visual = createDecorationVisual(decoration, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual); visual.userData['decorationInstanceId'] = id; visual.userData['decoration'] = decoration; visual.traverse((child) => { child.userData['decorationInstanceId'] = id; child.userData['decoration'] = decoration; });
      this.decorationsGroup.add(visual); this.renderedDecorations.set(id, { id, decoration, signature, object: visual });
    }
  }

  private removeDecorationEntry(id: string, entry: RenderedDecorationEntry): void { if (entry.object.parent === this.decorationsGroup) this.decorationsGroup.remove(entry.object); disposeObject(entry.object); this.renderedDecorations.delete(id); }

  private updateDecorationSelection(selectedId: string | undefined): void {
    for (const child of [...this.decorationSelectionGroup.children]) { disposeObject(child); this.decorationSelectionGroup.remove(child); }
    if (!selectedId) return;
    const entry = this.renderedDecorations.get(selectedId); if (!entry) return;
    const bounds = new THREE.Box3().setFromObject(entry.object);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.04, bounds.max.x - bounds.min.x + .05), Math.max(.04, bounds.max.y - bounds.min.y + .05), Math.max(.04, bounds.max.z - bounds.min.z + .05))), new THREE.LineBasicMaterial({ color: this.palette.selection }));
    outline.position.copy(bounds.getCenter(new THREE.Vector3())); outline.userData['decorationInstanceId'] = selectedId; outline.renderOrder = 1001; this.decorationSelectionGroup.add(outline);
  }

  hit(event: PointerEvent, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    if (!this.renderer || !this.container || !project) return { status: 'invalid' };
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const decorationHit = this.raycaster.intersectObjects(this.decorationsGroup.children, true)[0];
    const blockHit = this.raycaster.intersectObjects(this.blocksGroup.children, true)[0];
    const decoration = decorationHit?.object.userData['decoration'] as PlacedDecoration | undefined;
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
      const attachment = resolveAttachmentPlacement(active?.id, block, hitPoint, project.blocks, this.definitionResolver);
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
    const attachment = block && hitPoint ? resolveAttachmentPlacement(active?.id, block, hitPoint, project.blocks, this.definitionResolver) : undefined;
    const placementContext = faceNormal ? { faceNormal, hitPoint: hitPoint ? { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } : undefined, facing: isHorizontalDirection(facing) ? facing : undefined, yaw: cameraYaw(this.camera), stateOverride: attachment?.stateOverride } : undefined;
    const plan = target && active && this.placementPlanProvider ? this.placementPlanProvider(project, active, target, placementContext) : undefined;
    this.syncSpecialVisualDescriptors(plan?.blocks ?? []);
    const decorationPlan = this.renderOptions.activeDecoration && block && faceNormal ? planDecorationPlacement(project, this.renderOptions.activeDecoration, block, facingFromNormal(faceNormal) ?? 'up') : undefined;
    const status = decorationPlan?.status === 'invalid' ? 'invalid' : plan?.validation.status ?? placementStatus(target, project.size, active?.support ?? 'unknown');
    this.updateGhostModel(active, plan);
    this.updateGhost(showGhost ? target : undefined, project, active, status, plan);
    if (showGhost && this.renderOptions.activeDecoration && decorationPlan?.decoration) this.updateDecorationGhost(decorationPlan.decoration, decorationPlan.status);
    this.render();
    return { target, block, status, faceNormal, placementContext, decoration, decorationPlan, decorationDistance: decorationHit?.distance, blockDistance: blockHit?.distance };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.decorationTextureCache?.dispose(); this.decorationTextureCache = undefined;
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this.renderOnControlChange);
    this.controls?.dispose();
    this.renderer?.domElement.removeEventListener('pointerdown', this.onCanvasPointerDownCapture, true);
    this.renderer?.domElement.removeEventListener('pointerup', this.onCanvasPointerUpCapture, true);
    this.renderer?.domElement.removeEventListener('pointercancel', this.onCanvasPointerUpCapture, true);
    this.renderer?.domElement.removeEventListener('wheel', this.onCanvasWheelCapture, true);
    if (typeof document !== 'undefined') { document.removeEventListener('keydown', this.onCameraKeyDown); document.removeEventListener('keyup', this.onCameraKeyUp); document.removeEventListener('focusin', this.onWindowBlur); document.removeEventListener('visibilitychange', this.onVisibilityChange); }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onWindowBlur);
    this.clearInput();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    for (const child of this.blocksGroup.children) disposeObject(child);
    this.blocksGroup.clear();
    for (const child of this.decorationsGroup.children) disposeObject(child);
    this.decorationsGroup.clear();
    for (const child of [...this.logicalSelectionGroup.children]) { child.traverse((object) => { if (object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.logicalSelectionGroup.remove(child); }
    for (const child of [...this.decorationGhostGroup.children]) disposeObject(child); this.decorationGhostGroup.clear();
    for (const child of [...this.decorationSelectionGroup.children]) disposeObject(child); this.decorationSelectionGroup.clear();
    this.renderedBlocks.clear(); this.renderedDecorations.clear(); this.providerGeneration += 1;
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

  rendererCounters(): RendererCounters {
    return this.instrumentation.snapshot();
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
  private clearDecorationGhost(): void { for (const child of [...this.decorationGhostGroup.children]) { disposeObject(child); this.decorationGhostGroup.remove(child); } }
  private updateDecorationGhost(candidate: PlacedDecoration, status: DecorationPlacementPlan['status']): void {
    this.clearDecorationGhost();
    const visual = createDecorationVisual(candidate, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual);
    visual.renderOrder = 2000;
    visual.traverse((object) => { object.renderOrder = 2000; if (object instanceof THREE.Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material.transparent = true; material.opacity = .5; material.depthWrite = false; material.depthTest = false; } } });
    const bounds = new THREE.Box3().setFromObject(visual); const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bounds.max.x - bounds.min.x + .05, bounds.max.y - bounds.min.y + .05, bounds.max.z - bounds.min.z + .05)), new THREE.LineBasicMaterial({ color: status === 'valid' ? this.palette.valid : this.palette.invalid, depthTest: false, depthWrite: false })); outline.position.copy(bounds.getCenter(new THREE.Vector3())); outline.renderOrder = 2001; visual.add(outline); this.decorationGhostGroup.add(visual); this.render();
  }
  clearInput(): void { this.pressedActions.clear(); if (this.cameraMoveFrame !== undefined) { cancelAnimationFrame(this.cameraMoveFrame); this.cameraMoveFrame = undefined; } }
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
    if (!position) return;
    this.focusBounds({ min: { x: position.x, y: position.y, z: position.z }, max: { x: position.x + 1, y: position.y + 1, z: position.z + 1 } });
  }

  focusBounds(bounds: CameraBounds | undefined): void {
    if (!bounds || !this.controls) return;
    const target = cameraBoundsCenter(bounds);
    const direction = this.camera.position.clone().sub(this.controls.target);
    const viewDirection = direction.lengthSq() ? direction.normalize() : perspectiveDirection();
    const distance = cameraDistanceForBounds(bounds, this.camera.fov, this.camera.aspect);
    this.setCamera(target, viewDirection, distance);
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
    for (const decoration of (project.decorations ?? []).filter((entry) => decorationHasGroup(entry, activeGroupId) && isDecorationVisible(entry, project.groups) && (!this.renderOptions.isolatedGroupId || decorationHasGroup(entry, this.renderOptions.isolatedGroupId)))) {
      const bounds = decorationAabb(decoration);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.04, bounds.max.x - bounds.min.x + .08), Math.max(.04, bounds.max.y - bounds.min.y + .08), Math.max(.04, bounds.max.z - bounds.min.z + .08))), new THREE.LineBasicMaterial({ color }));
      outline.position.set((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2);
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
    const movingDecorationIds = new Set(preview.decorationIds);
    for (const decoration of (project.decorations ?? []).filter((entry) => movingDecorationIds.has(entry.instanceId))) {
      const visual = createDecorationVisual(decoration, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual);
      visual.position.set(preview.offset.x, preview.offset.y, preview.offset.z);
      visual.renderOrder = 1002;
      visual.traverse((object) => {
        object.renderOrder = 1002;
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            material.transparent = true;
            material.opacity = .42;
            material.depthTest = false;
            material.depthWrite = false;
            if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial) material.color.set(color);
          }
        }
      });
      visual.userData['previewInvalid'] = !preview.valid;
      this.movePreviewGroup.add(visual);
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
    const worldBlocks = this.project ? new Map(this.project.blocks.map((entry) => [coordinateKey(entry.position), entry] as const)) : undefined;
    const worldContext = worldBlocks ? { getBlock: (position: VoxelCoordinate) => worldBlocks.get(coordinateKey(position)) } : undefined;
    void Promise.all(blocks.map(async (block) => ({ block, visual: await this.visualProvider!.create({ ...block, position: { x: 0, y: 0, z: 0 } }, worldContext) }))).then((results) => {
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

  private startCameraMovement(): void { if (this.cameraMoveFrame !== undefined) return; let previous = performance.now(); const step = (now: number) => { this.cameraMoveFrame = undefined; const delta = Math.min((now - previous) / 1000, .1); previous = now; this.moveCamera(this.pressedActions, delta); if (this.pressedActions.size) this.cameraMoveFrame = requestAnimationFrame(step); }; this.cameraMoveFrame = requestAnimationFrame(step); }
  private moveCamera(keys: ReadonlySet<KeyboardAction>, delta: number): void {
    if (!this.controls || !keys.size) return;
    const direction = cameraActionMovementDelta(keys, this.camera, this.controlConfiguration.cameraMoveSpeed, this.controlConfiguration.verticalMoveSpeed, delta);
    if (!direction.lengthSq()) return;
    this.camera.position.add(direction); this.controls.target.add(direction); this.controls.update();
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
function coordinateNeighbors(position: VoxelCoordinate): readonly VoxelCoordinate[] {
  return [
    { x: position.x + 1, y: position.y, z: position.z }, { x: position.x - 1, y: position.y, z: position.z },
    { x: position.x, y: position.y + 1, z: position.z }, { x: position.x, y: position.y - 1, z: position.z },
    { x: position.x, y: position.y, z: position.z + 1 }, { x: position.x, y: position.y, z: position.z - 1 },
  ];
}
const neighborPositions = coordinateNeighbors;
function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function renderFilterKey(options: ViewportRenderOptions): string {
  return stableValue({ layerY: options.layerY, visibility: options.visibility, referenceOpacity: options.referenceOpacity, isolatedGroupId: options.isolatedGroupId, isolatedGroupPositions: options.isolatedGroupPositions });
}
function isHorizontalDirection(value: string | undefined): value is 'north' | 'east' | 'south' | 'west' { return value === 'north' || value === 'east' || value === 'south' || value === 'west'; }
export function cameraMovementDirection(keys: ReadonlySet<string>, camera: THREE.Camera): THREE.Vector3 {
  const forward = camera.getWorldDirection(new THREE.Vector3()); forward.y = 0; if (forward.lengthSq() === 0) return new THREE.Vector3(); forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize(); const direction = new THREE.Vector3();
  if (keys.has('KeyW')) direction.add(forward); if (keys.has('KeyS')) direction.sub(forward); if (keys.has('KeyD')) direction.add(right); if (keys.has('KeyA')) direction.sub(right); if (keys.has('Space')) direction.y += 1; if (keys.has('ShiftLeft') || keys.has('ShiftRight')) direction.y -= 1;
  return direction;
}
function isMovementAction(action: KeyboardAction | undefined): action is Extract<KeyboardAction, `move-${string}`> { return !!action && action.startsWith('move-'); }
function cameraActionMovementDelta(actions: ReadonlySet<KeyboardAction>, camera: THREE.Camera, horizontalSpeed: number, verticalSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const direction = new THREE.Vector3();
  const horizontal = new Set<string>();
  if (actions.has('move-forward')) horizontal.add('KeyW'); if (actions.has('move-backward')) horizontal.add('KeyS'); if (actions.has('move-left')) horizontal.add('KeyA'); if (actions.has('move-right')) horizontal.add('KeyD');
  const horizontalDirection = cameraMovementDirection(horizontal, camera);
  if (horizontalDirection.lengthSq()) direction.add(horizontalDirection.normalize().multiplyScalar(deltaSeconds * horizontalSpeed));
  if (actions.has('move-up')) direction.y += deltaSeconds * verticalSpeed;
  if (actions.has('move-down')) direction.y -= deltaSeconds * verticalSpeed;
  return direction;
}
export function cameraMovementDelta(keys: ReadonlySet<string>, camera: THREE.Camera, horizontalSpeed: number, verticalSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const horizontalKeys = new Set([...keys].filter((key) => key === 'KeyW' || key === 'KeyA' || key === 'KeyS' || key === 'KeyD'));
  const direction = cameraMovementDirection(horizontalKeys, camera);
  if (direction.lengthSq()) direction.normalize().multiplyScalar(deltaSeconds * horizontalSpeed);
  const verticalDirection = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
  direction.y += verticalDirection * deltaSeconds * verticalSpeed;
  return direction;
}
function isTextInput(target: EventTarget | null): boolean { const element = target as HTMLElement | null; return !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable); }
function isDialogTarget(target: EventTarget | null): boolean { const element = target as HTMLElement | null; return !!element && (element.matches('[role="dialog"]') || element.closest('[role="dialog"]') !== null); }
function disposeObject(object: THREE.Object3D): void { (object.userData['ownedDecorationTextureCache'] as { dispose?: () => void } | undefined)?.dispose?.(); object.traverse((child) => { if (child instanceof THREE.Mesh) { if (!child.geometry.userData['providerOwnedGeometry']) child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const material of materials) { if (material.map?.userData['ownedBedAtlasTexture'] || material.map?.userData['ownedSignTexture']) material.map.dispose(); material.dispose(); } } }); }

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
