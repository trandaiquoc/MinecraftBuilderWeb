import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { FaceNormal, resolveAttachmentPlacement, placementStatus, projectGridBounds, targetFromBlockFace, targetFromEditingPlaneHit, targetFromGridHit, PlacementContext, PlacementStatus } from '../../editor/placement/placement';
import { blocksForLayers, YLayerVisibility } from '../../editor/viewport/y-layer';
import { visibleBlockEntries } from '../../editor/viewport/visible-blocks';
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
import { applyDecorationItemPreview, createDecorationVisual, DecorationTextureCache } from '../visuals/decoration-visuals';
import type { ItemStackData } from '../../items/item-stack.types';
import type { ActiveDecoration } from '../../decorations/decoration.service';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import { DEFAULT_MOUSE_BINDINGS, MouseAction, mouseActionForEvent } from '../../editor/input/mouse-bindings';
import { RendererDiagnostics, RendererCounters } from './renderer-diagnostics';
import { normalizeBlockBrightness, viewportLightingForBrightness, ViewportLighting } from './viewport-lighting';
import { FaceLockedSelectionPlane, FreeSpaceSelectionPlane, freeSpaceSelectionPlane } from '../../editor/selection/selection';

export interface ViewportHit { readonly target?: VoxelCoordinate; readonly status: PlacementStatus; readonly block?: VoxelCoordinate; readonly faceNormal?: FaceNormal; readonly placementContext?: PlacementContext; readonly decoration?: PlacedDecoration; readonly decorationPlan?: DecorationPlacementPlan; readonly decorationDistance?: number; readonly blockDistance?: number; }
type PlacementPlanProvider = (project: ProjectDocument, active: ActiveBlock, target: VoxelCoordinate, context: PlacementContext | undefined) => PlacementPlan | undefined;
export interface ViewportRenderOptions { readonly layerY?: number; readonly visibility?: YLayerVisibility; readonly referenceOpacity?: number; readonly selected?: VoxelCoordinate; readonly selectedPositions?: readonly VoxelCoordinate[]; readonly selectionKind?: string; readonly selectionCount?: number; readonly selectionBounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly selectedDecorationId?: string; readonly activeDecoration?: ActiveDecoration; readonly selectionBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly isolatedGroupId?: string; readonly isolatedGroupPositions?: readonly VoxelCoordinate[]; readonly activeGroupId?: string; readonly activeGroupPositions?: readonly VoxelCoordinate[]; readonly groupMovePreview?: GroupMovePreview; }
export type ViewportHydrationStatus = 'idle' | 'hydrating' | 'complete';
export interface ViewportHydrationProgress {
  readonly generation: number;
  readonly status: ViewportHydrationStatus;
  readonly completed: number;
  readonly total: number;
  readonly blocksCompleted: number;
  readonly blocksTotal: number;
  readonly decorationsCompleted: number;
  readonly decorationsTotal: number;
  readonly percent: number;
}
export interface ViewportPerformanceEvidence {
  readonly renderCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly renderedBlocks: number;
  readonly renderedDecorations: number;
  readonly object3dCount: number;
  readonly meshCount: number;
  readonly instanceMeshCount: number;
  readonly instanceMembers: number;
  readonly providerObjectCreations: number;
  readonly reusableTemplateCreations: number;
  readonly reusableTemplateCacheHits: number;
  readonly instancedBoundsComputations: number;
  readonly hydrationQueue: number;
  readonly hydrationRunning: number;
  readonly frameDurationMs: number;
}
export interface ViewportDiagnostics { readonly initialized: boolean; readonly disposed: boolean; readonly canvasWidth: number; readonly canvasHeight: number; readonly gridExists: boolean; readonly boundsExists: boolean; readonly rendererExists: boolean; readonly sceneExists: true; readonly cameraExists: true; readonly controlsExist: boolean; readonly themeApplied: boolean; readonly resizeApplied: boolean; readonly renderMode: 'demand'; readonly renderCount: number; }
export interface ViewportHydrationDiagnostics {
  readonly generation: number;
  readonly queued: number;
  readonly running: number;
  readonly globalRunning: number;
  readonly currentGenerationRunning: number;
  readonly staleRunning: number;
  readonly hydrationScheduled: boolean;
  readonly hydrationTimerActive: boolean;
  readonly hydrationBatchBudget: number;
  readonly pendingSignatureCount: number;
  readonly placeholderSignatureCount: number;
  readonly placeholderVisualCount: number;
  readonly renderedBlockCount: number;
  readonly expectedVisibleBlockCount: number;
  readonly runningOwnershipCount: number;
  readonly runningByGeneration: Readonly<Record<string, number>>;
  readonly orphanedHydrationCount: number;
  readonly orphanedHydrationSample: readonly string[];
  readonly completed: number;
  readonly total: number;
  readonly scheduled: boolean;
}
export interface VisibleSceneDiagnostics {
  readonly expectedVisibleVoxelCount: number;
  readonly renderedVoxelCount: number;
  readonly placeholderVoxelCount: number;
  readonly pendingVoxelCount: number;
  readonly expectedVoxelKeys: readonly string[];
  readonly renderedVoxelKeys: readonly string[];
  readonly placeholderVoxelKeys: readonly string[];
  readonly pendingVoxelKeys: readonly string[];
  readonly representedVoxelKeys: readonly string[];
}
export interface ViewportVoxelOwnershipDiagnostic {
  readonly coordinateKey: string;
  readonly expectedVisible: boolean;
  readonly renderedEntry: boolean;
  readonly placeholderEntry: boolean;
  readonly pendingSignature?: string;
  readonly queuedJob: boolean;
  readonly runningGeneration?: number;
}

export interface ViewportOwnershipDiagnostics {
  readonly authoritativeProjectBlockCount: number;
  readonly authoritativeVisibleBlockCount: number;
  readonly renderedBlockCount: number;
  readonly placeholderVisualCount: number;
  readonly instanceBatchCount: number;
  readonly instanceMemberCount: number;
  readonly placeholderBatchCount: number;
  readonly placeholderIndexCount: number;
  readonly blocksGroupChildCount: number;
  readonly blockLikeSceneObjectsOutsideBlocksGroup: number;
  readonly visibleMeshesOutsideBlocksGroup: number;
  readonly staleVoxelKeys: readonly string[];
  readonly batchInvariantViolations: readonly string[];
  readonly outsideBlocksGroupOwners: readonly string[];
  readonly visibleMeshCount: number;
  readonly visibleMeshSample: readonly ViewportVisibleMeshDiagnostic[];
  readonly visibleMeshesOutsideBlocksGroupSample: readonly ViewportVisibleMeshDiagnostic[];
  readonly directSceneChildren: readonly { readonly owner: string; readonly uuid: string; readonly visible: boolean; readonly childCount: number }[];
  readonly previewState: {
    readonly ghostVisible: boolean;
    readonly ghostModelPresent: boolean;
    readonly ghostModelVisible: boolean;
    readonly ghostModelKey: string;
    readonly ghostGeneration: number;
    readonly ghostTarget?: VoxelCoordinate;
    readonly movePreviewChildren: number;
    readonly decorationGhostChildren: number;
    readonly logicalSelectionChildren: number;
    readonly selectionOutlineVisible: boolean;
    readonly reusableTemplateCount: number;
  };
  readonly hydrationState: Pick<ViewportHydrationDiagnostics, 'queued' | 'running' | 'pendingSignatureCount' | 'placeholderSignatureCount' | 'runningOwnershipCount'>;
}

export interface ViewportVisibleMeshDiagnostic {
  readonly owner: string;
  readonly objectType: string;
  readonly uuid: string;
  readonly parentPath: readonly { readonly type: string; readonly name: string; readonly uuid: string; readonly visible: boolean }[];
  readonly localPosition: CameraVector;
  readonly worldPosition: CameraVector;
  readonly matrixWorld: readonly number[];
  readonly geometry: { readonly uuid: string; readonly type: string };
  readonly materials: readonly { readonly uuid: string; readonly type: string; readonly visible: boolean; readonly opacity: number; readonly texture?: { readonly uuid: string; readonly sourceUuid: string; readonly sourceIdentity?: string } }[];
  readonly userData: Readonly<Record<string, unknown>>;
  readonly instanceCount?: number;
}

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
  instanceBatchKey?: string;
  instanceIndex?: number;
}

interface RenderedDecorationEntry {
  readonly id: string;
  readonly decoration: PlacedDecoration;
  readonly signature: string;
  readonly object: THREE.Object3D;
}

interface BlockHydrationJob {
  readonly token: number;
  readonly key: string;
  readonly block: ProjectDocument['blocks'][number];
  readonly signature: string;
  readonly role: RenderedBlockEntry['role'];
  readonly worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined };
  readonly options: ViewportRenderOptions;
  readonly allowInstancing: boolean;
}
interface DecorationHydrationJob {
  readonly token: number;
  readonly id: string;
  readonly decoration: PlacedDecoration;
  readonly signature: string;
}

export const VIEWPORT_BOOTSTRAP_SIZE: ProjectSize = { x: 16, y: 16, z: 16 };
export const VIEWPORT_HYDRATION_BATCH_SIZE = 96;
export const VIEWPORT_VISUAL_CONCURRENCY = 6;
export const VIEWPORT_INSTANCE_CHUNK_SIZE = 16;
export const VIEWPORT_INSTANCE_THRESHOLD = 256;
export const VIEWPORT_HYDRATION_HUD_WORK_THRESHOLD = 32;
export const VIEWPORT_HYDRATION_HUD_DELAY_MS = 180;
export const VIEWPORT_HYDRATION_COMPLETE_DISPLAY_MS = 800;

interface InstancePartTemplate { readonly geometry: THREE.BufferGeometry; readonly material: THREE.Material; readonly matrix: THREE.Matrix4; }
interface InstanceBatch {
  readonly key: string;
  readonly capacity: number;
  readonly templates: readonly InstancePartTemplate[];
  readonly parts: readonly THREE.InstancedMesh[];
  readonly keys: string[];
  readonly positions: VoxelCoordinate[];
}

interface PlaceholderBatch {
  readonly key: string;
  readonly capacity: number;
  readonly mesh: THREE.InstancedMesh;
  readonly keys: string[];
  readonly positions: VoxelCoordinate[];
}

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
  private readonly selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, depthWrite: false }));
  private readonly selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
  private readonly movePreviewGroup = new THREE.Group();
  private readonly decorationGhostGroup = new THREE.Group();
  private readonly decorationSelectionGroup = new THREE.Group();
  private readonly logicalSelectionGroup = new THREE.Group();
  private readonly logicalSelectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04));
  private readonly logicalSelectionMaterial = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, depthWrite: false });
  private readonly groupHighlightGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.12, 1.12, 1.12));
  private readonly groupHighlightMaterial = new THREE.LineBasicMaterial({ color: 0x58d8d0 });
  private lastSelectionPositions?: readonly VoxelCoordinate[];
  private lastSelectionBounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
  private lastSelectionKind?: string;
  private lastSelectionCount = -1;
  private lastSelected?: VoxelCoordinate;
  private lastSelectionBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
  private readonly fallbackGeometry = Object.assign(new THREE.BoxGeometry(1, 1, 1), { userData: { sharedFallbackGeometry: true } });
  private readonly fallbackMaterials = {
    normal: Object.assign(new THREE.MeshLambertMaterial({ color: 0x8a94a6 }), { userData: { sharedFallbackMaterial: true } }),
    reference: Object.assign(new THREE.MeshLambertMaterial({ color: 0x9aa5b5, transparent: true }), { userData: { sharedFallbackMaterial: true } }),
    missing: Object.assign(new THREE.MeshLambertMaterial({ color: 0xff5a67 }), { userData: { sharedFallbackMaterial: true } }),
  };
  private readonly placeholderGeometry = Object.assign(new THREE.BoxGeometry(1, 1, 1), { userData: { sharedPlaceholderGeometry: true } });
  private readonly placeholderMaterials = {
    normal: Object.assign(new THREE.MeshLambertMaterial({ color: 0x65717e, transparent: true, opacity: .62 }), { userData: { sharedPlaceholderMaterial: true } }),
    reference: Object.assign(new THREE.MeshLambertMaterial({ color: 0x65717e, transparent: true, opacity: .24, depthWrite: false }), { userData: { sharedPlaceholderMaterial: true } }),
    missing: Object.assign(new THREE.MeshLambertMaterial({ color: 0x9b5964, transparent: true, opacity: .58 }), { userData: { sharedPlaceholderMaterial: true } }),
  };
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
  private readonly renderOnControlChange = () => { this.cameraInteractingUntil = performance.now() + 180; this.render(); };
  private cameraMoveFrame?: number;
  private readonly pressedActions = new Set<MovementAction>();
  private mouseBindings: Readonly<Record<MouseAction, string>> = DEFAULT_MOUSE_BINDINGS;
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
    if (action !== 'primary-action' && action !== 'delete-target') return;
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
  private decorationItemPreview?: (item: ItemStackData) => Promise<string | undefined>;
  private paintingResource?: (variantId: string) => string | undefined;
  private specialVisualResolver?: (blockId: string) => ContentSpecialVisualDescriptor | undefined;
  private specialVisualRevision?: number;
  private specialVisualSignature = '';
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
  private readonly instanceBatches = new Map<string, InstanceBatch>();
  private readonly reusableInstanceTemplates = new Map<string, readonly InstancePartTemplate[]>();
  private readonly placeholderBatches = new Map<string, PlaceholderBatch>();
  private readonly placeholderIndices = new Map<string, { readonly batchKey: string; readonly index: number }>();
  private readonly hydrationProgressListeners = new Set<(progress: ViewportHydrationProgress) => void>();
  private hydrationProgressState: ViewportHydrationProgress = { generation: 0, status: 'idle', completed: 0, total: 0, blocksCompleted: 0, blocksTotal: 0, decorationsCompleted: 0, decorationsTotal: 0, percent: 0 };
  private hydrationProgressHideTimer?: ReturnType<typeof setTimeout>;
  private hemisphereLight?: THREE.HemisphereLight;
  private keyLight?: THREE.DirectionalLight;
  private blockBrightness = 3;
  private structureSyncKey = '';
  private syncedProject?: ProjectDocument;
  private syncedBlockCount?: number;
  private syncedBlocksReference?: readonly ProjectDocument['blocks'][number][];
  private decorationSyncKey = '';
  private syncedDecorationProject?: ProjectDocument;
  private decorationRevision = 0;
  private providerGeneration = 0;
  private providerStats?: VisualCacheStats;
  private hydrationGeneration = 0;
  private hydrationQueue: BlockHydrationJob[] = [];
  private readonly pendingHydrationSignatures = new Map<string, string>();
  /** Ownership signatures for final fallback placeholders (no async job). */
  private readonly placeholderSignatures = new Map<string, string>();
  private readonly runningHydrationKeys = new Map<string, number>();
  private decorationHydrationQueue: DecorationHydrationJob[] = [];
  private readonly pendingDecorationSignatures = new Map<string, string>();
  private hydrationRunning = 0;
  private readonly hydrationRunningByGeneration = new Map<number, number>();
  private hydrationBatchBudget = 0;
  private hydrationTimer?: ReturnType<typeof setTimeout>;
  private hydrationScheduled = false;
  private cameraInteractingUntil = 0;
  private lastRenderTimestamp = 0;
  private frameDurationMs = 0;
  private renderScheduled = false;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private fallbackGeometryCounted = false;
  private readonly fallbackMaterialRoles = new Set<string>();

  constructor(readonly instrumentation = new RendererDiagnostics()) {
    const selectionBoxMaterial = this.selectionBox.material as THREE.LineBasicMaterial;
    selectionBoxMaterial.depthTest = false;
    selectionBoxMaterial.depthWrite = false;
    this.selectionOutline.renderOrder = 2000;
    this.selectionBox.renderOrder = 2000;
    this.logicalSelectionGroup.renderOrder = 2000;
  }

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
    document.addEventListener('focusin', this.onWindowBlur); window.addEventListener('blur', this.onWindowBlur); document.addEventListener('visibilitychange', this.onVisibilityChange);
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
    this.fallbackMaterials.normal.color.setHex(palette.block);
    this.fallbackMaterials.reference.color.setHex(palette.referenceBlock);
    this.fallbackMaterials.missing.color.setHex(palette.missingBlock);
    this.placeholderMaterials.normal.color.setHex(palette.block);
    this.placeholderMaterials.reference.color.setHex(palette.referenceBlock);
    this.placeholderMaterials.missing.color.setHex(palette.missingBlock);
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

  cameraKeyDown(action: MovementAction): void { if (this.disposed) return; this.pressedActions.add(action); this.startCameraMovement(); }
  cameraKeyUp(action: MovementAction): void { this.pressedActions.delete(action); if (!this.pressedActions.size && this.cameraMoveFrame === undefined) this.render(); }

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
    const previousProvider = this.visualProvider;
    this.visualProvider = provider;
    this.clearReusableInstanceTemplates();
    this.visualProvider?.retain?.();
    this.providerStats = undefined;
    this.providerGeneration += 1;
    this.structureSyncKey = '';
    this.specialVisualSignature = '';
    this.ghostModelKey = '';
    if (provider) this.syncSpecialVisualDescriptors();
    this.update(this.project, this.activeBlock, this.renderOptions);
    previousProvider?.release?.();
  }
  setSpecialVisualDescriptorResolver(resolver: ((blockId: string) => ContentSpecialVisualDescriptor | undefined) | undefined, revision?: number): void {
    if (resolver === this.specialVisualResolver && revision === this.specialVisualRevision) return;
    this.specialVisualResolver = resolver;
    this.specialVisualRevision = revision;
    if (this.syncSpecialVisualDescriptors()) {
      this.structureSyncKey = '';
      this.update(this.project, this.activeBlock, this.renderOptions);
    }
  }
  setDecorationTextureProvider(provider: ((resource: string) => string | undefined) | undefined): void {
    if (provider === this.decorationTextureUrl) return;
    this.decorationTextureCache?.dispose();
    this.decorationTextureCache = provider ? new DecorationTextureCache(provider, undefined, () => this.render()) : undefined;
    this.decorationTextureUrl = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemResourceProvider(provider: ((itemId: string) => readonly string[]) | undefined): void {
    if (provider === this.decorationItemResources) return;
    this.decorationItemResources = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemVisualProvider(provider: ((itemId: string) => ResolvedItemVisual | undefined) | undefined): void {
    if (provider === this.decorationItemVisual) return;
    this.decorationItemVisual = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemPreviewProvider(provider: ((item: ItemStackData) => Promise<string | undefined>) | undefined): void {
    if (provider === this.decorationItemPreview) return;
    this.decorationItemPreview = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setPaintingTextureResolver(provider: ((variantId: string) => string | undefined) | undefined): void {
    if (provider === this.paintingResource) return;
    this.paintingResource = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  setPlacementPlanProvider(provider: PlacementPlanProvider | undefined): void { this.placementPlanProvider = provider; }
  setBlockDefinitionResolver(resolver: ((blockId: string) => BlockDefinition | undefined) | undefined): void { this.definitionResolver = resolver; }

  private collectSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): readonly NormalizedSpecialVisualDescriptor[] {
    const ids = new Set([...(this.project?.blocks ?? []).map((block) => block.id), ...(this.activeBlock ? [this.activeBlock.id] : []), ...plannedBlocks.map((block) => block.id)]);
    return [...ids].flatMap((id) => { const descriptor = this.specialVisualResolver?.(id); return descriptor ? [{ ...descriptor, contentId: id }] : []; });
  }
  private syncSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): boolean {
    const descriptors = this.collectSpecialVisualDescriptors(plannedBlocks);
    const signature = stableValue(descriptors.slice().sort((left, right) => left.contentId.localeCompare(right.contentId)));
    const changed = signature !== this.specialVisualSignature;
    this.specialVisualSignature = signature;
    this.visualProvider?.setSpecialVisualDescriptors?.(descriptors);
    return changed;
  }

  update(project: ProjectDocument | undefined, active: ActiveBlock | undefined, options: ViewportRenderOptions = {}): void {
    this.project = project;
    this.activeBlock = active;
    this.renderOptions = options;
    this.syncSpecialVisualDescriptors();
    const syncKey = project ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${renderFilterKey(options)}|${this.providerGeneration}` : 'empty';
    const blockInputChanged = project !== this.syncedProject || syncKey !== this.structureSyncKey;
    const decorationKey = project ? `${project.id}|${renderFilterKey(options)}|${this.decorationRevision}` : 'empty';
    const decorationInputChanged = project !== this.syncedDecorationProject || decorationKey !== this.decorationSyncKey;
    const full = syncKey !== this.structureSyncKey;
    const inPlaceBlockMutation = project === this.syncedProject && project !== undefined && (project.blocks !== this.syncedBlocksReference || project.blocks.length !== this.syncedBlockCount);
    if (blockInputChanged || inPlaceBlockMutation) {
      const projectIdentityChanged = project !== this.syncedProject;
      const incrementalProjectChange = projectIdentityChanged && !full && this.renderedBlocks.size === 0 && (this.hydrationQueue.length > 0 || this.pendingHydrationSignatures.size > 0 || this.placeholderSignatures.size > 0);
      if (full || !incrementalProjectChange && (projectIdentityChanged || inPlaceBlockMutation)) this.cancelHydration();
      this.structureSyncKey = syncKey;
      this.syncedProject = project;
      this.syncedBlockCount = project?.blocks.length;
      this.syncedBlocksReference = project?.blocks;
      this.reconcileStructure(project, options, full);
    }
    if (decorationInputChanged) {
      if (!blockInputChanged) this.cancelDecorationHydration();
      this.decorationSyncKey = decorationKey;
      this.syncedDecorationProject = project;
      this.reconcileDecorations(project, options, false);
      this.beginHydrationProgress(this.hydrationQueue.length + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0), this.decorationHydrationQueue.length);
    }
    this.setProjectBounds(project);
    this.setEditingPlane(options.layerY, project);
    const visualSelection = this.visibleSelection(project, options);
    this.updateSelection(visualSelection.selected, visualSelection.positions, visualSelection.kind, visualSelection.count, visualSelection.bounds, visualSelection.box);
    this.updateActiveGroup(project, options.activeGroupId, options.activeGroupPositions);
    this.updateMovePreview(project, options.groupMovePreview);
    this.updateGhostModel(active, undefined);
    this.clearDecorationGhost();
    this.updateDecorationSelection(options.selectedDecorationId);
    if (options.selectedDecorationId) {
      const selectedDecoration = this.renderedDecorations.get(options.selectedDecorationId);
      if (selectedDecoration) this.hydrateDecorationItemPreview(selectedDecoration);
    }
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
    const allowInstancing = visible.length >= VIEWPORT_INSTANCE_THRESHOLD;
    const visibleMap = new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    this.hydrationQueue = this.hydrationQueue.filter((job) => {
      const next = visibleMap.get(job.key);
      return !!next && job.signature === next.signature;
    });
    if (full) this.instrumentation.record('fullSceneRebuilds');
    const changed = new Set<string>();
    for (const [key, entry] of this.renderedBlocks) if (!visibleMap.has(key)) { this.removeBlockEntry(key, entry); this.pendingHydrationSignatures.delete(key); this.placeholderSignatures.delete(key); this.instrumentation.record('blockRemovals'); }
    for (const key of this.placeholderIndices.keys()) if (!visibleMap.has(key)) this.removePlaceholderVisual(key);
    for (const key of this.pendingHydrationSignatures.keys()) if (!visibleMap.has(key)) this.pendingHydrationSignatures.delete(key);
    for (const key of this.placeholderSignatures.keys()) if (!visibleMap.has(key)) this.placeholderSignatures.delete(key);
    for (const key of this.runningHydrationKeys.keys()) if (!visibleMap.has(key)) this.runningHydrationKeys.delete(key);
    for (const [key, entry] of visibleMap) {
      const current = this.renderedBlocks.get(key);
      const pendingSignature = this.pendingHydrationSignatures.get(key);
      const placeholderSignature = this.placeholderSignatures.get(key);
      if (full || !current || current.signature !== entry.signature || current.role !== entry.role) {
        if (!current && pendingSignature === entry.signature) continue;
        // A placeholder is only an existing representation. It is not proof
        // that real hydration is queued. Once a provider becomes available,
        // placeholder-only entries must be promoted to hydration work.
        if (!current && !this.visualProvider && placeholderSignature === entry.signature) continue;
        changed.add(key);
      }
      if (!changed.has(key) && current) this.removePlaceholderVisual(key);
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
      else if (this.pendingHydrationSignatures.get(key) === undefined && this.placeholderSignatures.get(key) === undefined) this.instrumentation.record('blockAdds');
      this.ensurePlaceholderVisual(key, next.block, next.role);
      this.pendingHydrationSignatures.set(key, next.signature);
      this.instrumentation.record('blockVisualCreations');
      // A fallback-only scene has no asynchronous visual work. Keep the
      // placeholder as the final representation instead of scheduling work
      // that cannot produce a real model.
      if (!this.visualProvider) {
        this.pendingHydrationSignatures.delete(key);
        this.placeholderSignatures.set(key, next.signature);
        continue;
      }
      this.placeholderSignatures.delete(key);
      this.hydrationQueue.push({ token: this.hydrationGeneration, key, block: next.block, signature: next.signature, role: next.role, worldContext, options, allowInstancing });
    }
    this.hydrationQueue.sort((left, right) => (left.role === right.role ? 0 : left.role === 'normal' ? -1 : 1));
    const previousMax = this.instrumentation.snapshot().maxPendingVisualJobs;
    if (this.hydrationQueue.length > previousMax) this.instrumentation.record('maxPendingVisualJobs', this.hydrationQueue.length - previousMax);
    this.beginHydrationProgress(this.hydrationQueue.length + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0), this.decorationHydrationQueue.length);
    if (this.hydrationQueue.length) this.scheduleHydrationPump();
  }

  private visibleBlocks(project: ProjectDocument, options: ViewportRenderOptions): readonly { readonly block: ProjectDocument['blocks'][number]; readonly role: 'normal' | 'reference' | 'missing'; readonly signature: string }[] {
    return visibleBlockEntries(project, options).map((block) => {
      const role = block.kind === 'missing' ? 'missing' : options.layerY !== undefined && block.position.y !== options.layerY ? 'reference' : 'normal';
      return { block, role, signature: `${stableValue(block)}|${role}|${options.referenceOpacity ?? .28}` };
    });
  }

  private visibleSelection(project: ProjectDocument | undefined, options: ViewportRenderOptions): { readonly selected?: VoxelCoordinate; readonly positions?: readonly VoxelCoordinate[]; readonly kind?: string; readonly count?: number; readonly bounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly box?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } } {
    if (!project) return { selected: options.selected, positions: options.selectedPositions, kind: options.selectionKind, count: options.selectionCount, bounds: options.selectionBounds, box: options.selectionBox };
    const visible = this.visibleBlocks(project, options);
    const visibleKeys = new Set(visible.map((entry) => coordinateKey(entry.block.position)));
    const positions = (options.selectedPositions ?? []).filter((position) => visibleKeys.has(coordinateKey(position)));
    const selected = options.selected && visibleKeys.has(coordinateKey(options.selected)) ? options.selected : undefined;
    const inBounds = (position: VoxelCoordinate, bounds: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }): boolean => position.x >= bounds.min.x && position.x <= bounds.max.x && position.y >= bounds.min.y && position.y <= bounds.max.y && position.z >= bounds.min.z && position.z <= bounds.max.z;
    const boundedVisible = options.selectionBounds ? visible.filter((entry) => inBounds(entry.block.position, options.selectionBounds!)).map((entry) => entry.block.position) : [];
    const bounds = options.selectionBounds ? boundsOfPositions(boundedVisible) : undefined;
    const box = options.selectionBox && visible.some((entry) => inBounds(entry.block.position, options.selectionBox!)) ? options.selectionBox : undefined;
    const count = options.selectionBounds ? boundedVisible.length : positions.length || (selected ? 1 : 0);
    return { selected, positions, kind: options.selectionKind, count, bounds, box };
  }

  private beginHydrationProgress(blocksTotal: number, decorationsTotal: number): void {
    if (this.hydrationProgressHideTimer !== undefined) { clearTimeout(this.hydrationProgressHideTimer); this.hydrationProgressHideTimer = undefined; }
    const current = this.hydrationProgressState;
    const sameGeneration = current.generation === this.hydrationGeneration && current.status === 'hydrating';
    if (sameGeneration) {
      const nextBlocksTotal = Math.max(current.blocksTotal, current.blocksCompleted + blocksTotal);
      const nextDecorationsTotal = Math.max(current.decorationsTotal, current.decorationsCompleted + decorationsTotal);
      const total = nextBlocksTotal + nextDecorationsTotal;
      if (total > 0) {
        const completed = current.blocksCompleted + current.decorationsCompleted;
        this.publishHydrationProgress({ ...current, total, blocksTotal: nextBlocksTotal, decorationsTotal: nextDecorationsTotal, completed, percent: total > 0 ? completed / total * 100 : 0 });
        return;
      }
    }
    const total = blocksTotal + decorationsTotal;
    if (!total) { this.publishHydrationProgress({ generation: this.hydrationGeneration, status: 'idle', completed: 0, total: 0, blocksCompleted: 0, blocksTotal: 0, decorationsCompleted: 0, decorationsTotal: 0, percent: 0 }); return; }
    this.publishHydrationProgress({ generation: this.hydrationGeneration, status: 'hydrating', completed: 0, total, blocksCompleted: 0, blocksTotal, decorationsCompleted: 0, decorationsTotal, percent: 0 });
  }

  private completeHydrationPart(token: number, kind: 'block' | 'decoration'): void {
    const current = this.hydrationProgressState;
    if (current.status !== 'hydrating' || current.generation !== token) return;
    const blocksCompleted = current.blocksCompleted + (kind === 'block' ? 1 : 0);
    const decorationsCompleted = current.decorationsCompleted + (kind === 'decoration' ? 1 : 0);
    const completed = blocksCompleted + decorationsCompleted;
    const percent = current.total > 0 ? completed / current.total * 100 : 100;
    if (completed >= current.total) {
      this.publishHydrationProgress({ ...current, status: 'complete', completed: current.total, blocksCompleted: current.blocksTotal, decorationsCompleted: current.decorationsTotal, percent: 100 });
      this.hydrationProgressHideTimer = setTimeout(() => {
        if (this.hydrationProgressState.generation === token && this.hydrationProgressState.status === 'complete') this.publishHydrationProgress({ generation: token, status: 'idle', completed: 0, total: 0, blocksCompleted: 0, blocksTotal: 0, decorationsCompleted: 0, decorationsTotal: 0, percent: 0 });
        this.hydrationProgressHideTimer = undefined;
      }, VIEWPORT_HYDRATION_COMPLETE_DISPLAY_MS);
      return;
    }
    this.publishHydrationProgress({ ...current, completed, blocksCompleted, decorationsCompleted, percent });
  }

  private publishHydrationProgress(progress: ViewportHydrationProgress): void {
    this.hydrationProgressState = progress;
    for (const listener of this.hydrationProgressListeners) listener(progress);
  }

  private resetHydrationProgress(): void {
    if (this.hydrationProgressHideTimer !== undefined) { clearTimeout(this.hydrationProgressHideTimer); this.hydrationProgressHideTimer = undefined; }
    this.publishHydrationProgress({ generation: this.hydrationGeneration, status: 'idle', completed: 0, total: 0, blocksCompleted: 0, blocksTotal: 0, decorationsCompleted: 0, decorationsTotal: 0, percent: 0 });
  }

  private scheduleHydrationPump(delay: boolean | number = false): void {
    if (this.hydrationScheduled || this.disposed) return;
    this.hydrationScheduled = true;
    const run = () => { this.hydrationScheduled = false; this.hydrationTimer = undefined; this.processHydrationBatch(); };
    if (delay) this.hydrationTimer = setTimeout(run, typeof delay === 'number' ? delay : 0);
    else queueMicrotask(run);
  }

  private processHydrationBatch(): void {
    const token = this.hydrationGeneration;
    const cameraInteracting = performance.now() < this.cameraInteractingUntil;
    if (this.hydrationBatchBudget <= 0) this.hydrationBatchBudget = this.adaptiveHydrationBudget(cameraInteracting);
    this.instrumentation.record('hydrationBatches');
    while (this.hydrationRunning < VIEWPORT_VISUAL_CONCURRENCY && this.hydrationQueue.length && this.hydrationBatchBudget > 0) {
      const job = this.hydrationQueue.shift()!;
      if (job.token !== token || token !== this.hydrationGeneration) continue;
      this.pendingHydrationSignatures.delete(job.key);
      this.hydrationBatchBudget -= 1;
      this.hydrationRunning += 1;
      this.runningHydrationKeys.set(job.key, job.token);
      this.hydrationRunningByGeneration.set(job.token, (this.hydrationRunningByGeneration.get(job.token) ?? 0) + 1);
      const complete = () => this.completeHydrationJob(job);
      try {
        this.createBlockEntry(job.block, job.role, job.worldContext, job.options, job.allowInstancing, complete);
      } catch (error: unknown) {
        // Cached/template insertion is synchronous and can fail before a
        // provider promise exists. Convert that failure into a final fallback
        // so one malformed visual cannot terminate the entire pump.
        this.rollbackPartialInstanceVisual(job.key);
        this.markHydrationFailure(job, error);
        complete();
      }
    }
    this.processDecorationBatch(token);
    if (this.hydrationBatchBudget <= 0) this.hydrationBatchBudget = 0;
    if ((this.hydrationQueue.length && this.hydrationRunning === 0) || this.decorationHydrationQueue.length) this.scheduleHydrationPump(true);
  }

  private completeHydrationJob(job: BlockHydrationJob): void {
    if (this.runningHydrationKeys.get(job.key) === job.token) this.runningHydrationKeys.delete(job.key);
    this.hydrationRunning = Math.max(0, this.hydrationRunning - 1);
    const generationRunning = Math.max(0, (this.hydrationRunningByGeneration.get(job.token) ?? 1) - 1);
    if (generationRunning) this.hydrationRunningByGeneration.set(job.token, generationRunning); else this.hydrationRunningByGeneration.delete(job.token);
    this.completeHydrationPart(job.token, 'block');
    this.scheduleHydrationPump(this.hydrationBatchBudget <= 0);
  }

  private markHydrationFailure(job: BlockHydrationJob, error: unknown): void {
    const entry = this.renderedBlocks.get(job.key);
    if (!entry) return;
    entry.fallback.userData['renderMode'] = 'fallback';
    entry.fallback.userData['diagnostics'] = [{ code: 'GEOMETRY_BUILD_FAILED', message: error instanceof Error ? error.message : 'Visual construction failed' }];
    this.scheduleRender();
  }

  private rollbackPartialInstanceVisual(key: string): void {
    for (const [batchKey, batch] of this.instanceBatches) {
      const index = batch.keys.indexOf(key);
      if (index < 0) continue;
      const entry = this.renderedBlocks.get(key);
      if (entry) {
        entry.instanceBatchKey = batchKey;
        entry.instanceIndex = index;
        this.removeInstanceVisual(key, entry);
      }
    }
  }

  private adaptiveHydrationBudget(cameraInteracting = false): number {
    if (cameraInteracting) {
      if (this.frameDurationMs >= 28) return 8;
      if (this.frameDurationMs >= 18) return 16;
      return 24;
    }
    if (this.frameDurationMs >= 28) return 24;
    if (this.frameDurationMs >= 18) return 48;
    return VIEWPORT_HYDRATION_BATCH_SIZE;
  }

  private processDecorationBatch(token: number): void {
    let processed = 0;
    while (processed < VIEWPORT_HYDRATION_BATCH_SIZE && this.decorationHydrationQueue.length) {
      const job = this.decorationHydrationQueue.shift()!;
      if (job.token !== token || token !== this.hydrationGeneration) continue;
      this.pendingDecorationSignatures.delete(job.id);
      this.instrumentation.record('decorationVisualCreations');
      const visual = createDecorationVisual(job.decoration, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual, false);
      visual.userData['decorationInstanceId'] = job.id; visual.userData['decoration'] = job.decoration;
      visual.traverse((child) => { child.userData['decorationInstanceId'] = job.id; child.userData['decoration'] = job.decoration; });
      this.decorationsGroup.add(visual);
      const entry = { id: job.id, decoration: job.decoration, signature: job.signature, object: visual };
      this.renderedDecorations.set(job.id, entry);
      this.hydrateDecorationItemPreview(entry);
      this.completeHydrationPart(job.token, 'decoration');
      processed += 1;
    }
    if (processed > 0) this.scheduleRender();
  }

  private cancelHydration(): void {
    this.hydrationGeneration += 1;
    this.instrumentation.record('hydrationGenerations');
    if (this.hydrationQueue.length || this.hydrationRunning) this.instrumentation.record('cancelledHydrations');
    this.hydrationQueue = [];
    this.pendingHydrationSignatures.clear();
    this.runningHydrationKeys.clear();
    this.cancelDecorationHydration();
    this.hydrationBatchBudget = 0;
    if (this.hydrationTimer !== undefined) { clearTimeout(this.hydrationTimer); this.hydrationTimer = undefined; }
    this.hydrationScheduled = false;
    this.resetHydrationProgress();
  }

  private cancelDecorationHydration(): void {
    this.decorationHydrationQueue = [];
    this.pendingDecorationSignatures.clear();
  }

  private scheduleRender(): void {
    if (this.renderScheduled || this.disposed) return;
    this.renderScheduled = true;
    this.instrumentation.record('coalescedRenderRequests');
    this.renderTimer = setTimeout(() => { this.renderScheduled = false; this.renderTimer = undefined; this.render(); }, 0);
  }

  private ensurePlaceholderVisual(key: string, block: ProjectDocument['blocks'][number], role: RenderedBlockEntry['role']): void {
    if (this.placeholderIndices.has(key)) return;
    const batchKey = `${role}|${chunkKey(block.position)}`;
    let batch = this.placeholderBatches.get(batchKey);
    if (!batch) {
      const material = this.placeholderMaterials[role];
      const mesh = new THREE.InstancedMesh(this.placeholderGeometry, material, VIEWPORT_INSTANCE_CHUNK_SIZE ** 3);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData['instanceVoxels'] = [];
      mesh.userData['instanceKeys'] = [];
      mesh.userData['placeholder'] = true;
      mesh.userData['instanceBatchKey'] = batchKey;
      this.blocksGroup.add(mesh);
      setStableMeshBounds(mesh, stableChunkBounds(chunkKey(block.position), unitVoxelEnvelope()));
      this.instrumentation.record('instancedBoundsComputations');
      batch = { key: batchKey, capacity: VIEWPORT_INSTANCE_CHUNK_SIZE ** 3, mesh, keys: [], positions: [] };
      this.placeholderBatches.set(batchKey, batch);
    }
    if (batch.keys.length >= batch.capacity) return;
    const index = batch.keys.length;
    const position = { ...block.position };
    batch.keys.push(key); batch.positions.push(position);
    batch.mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(position.x + .5, position.y + .5, position.z + .5));
    batch.mesh.count = index + 1;
    (batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[]).push(position);
    (batch.mesh.userData['instanceKeys'] as string[]).push(key);
    batch.mesh.instanceMatrix.needsUpdate = true;
    this.placeholderIndices.set(key, { batchKey, index });
  }

  private removePlaceholderVisual(key: string): void {
    const reference = this.placeholderIndices.get(key);
    if (!reference) return;
    const batch = this.placeholderBatches.get(reference.batchKey);
    this.placeholderIndices.delete(key);
    if (!batch) return;
    const index = reference.index;
    const last = batch.keys.length - 1;
    if (index !== last) {
      const movedKey = batch.keys[last];
      const movedPosition = batch.positions[last];
      batch.keys[index] = movedKey; batch.positions[index] = movedPosition;
      const voxels = batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[];
      const keys = batch.mesh.userData['instanceKeys'] as string[];
      voxels[index] = movedPosition; keys[index] = movedKey;
      batch.mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(movedPosition.x + .5, movedPosition.y + .5, movedPosition.z + .5));
      this.placeholderIndices.set(movedKey, { batchKey: batch.key, index });
    }
    batch.keys.pop(); batch.positions.pop();
    (batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[]).pop();
    (batch.mesh.userData['instanceKeys'] as string[]).pop();
    batch.mesh.count = batch.keys.length;
    batch.mesh.instanceMatrix.needsUpdate = true;
    if (!batch.keys.length) {
      this.blocksGroup.remove(batch.mesh);
      this.placeholderBatches.delete(batch.key);
    }
  }

  private clearPlaceholderVisuals(): void {
    for (const batch of this.placeholderBatches.values()) this.blocksGroup.remove(batch.mesh);
    this.placeholderBatches.clear();
    this.placeholderIndices.clear();
  }

  private createBlockEntry(block: ProjectDocument['blocks'][number], role: RenderedBlockEntry['role'], worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined }, options: ViewportRenderOptions, allowInstancing: boolean, onComplete?: () => void): void {
    this.removePlaceholderVisual(coordinateKey(block.position));
    if (!this.fallbackGeometryCounted) { this.instrumentation.record('fallbackGeometryConstructions'); this.fallbackGeometryCounted = true; }
    if (!this.fallbackMaterialRoles.has(role)) { this.instrumentation.record('fallbackMaterialCreations'); this.fallbackMaterialRoles.add(role); }
    const isReference = role === 'reference';
    const material = role === 'missing' ? this.fallbackMaterials.missing : isReference ? this.fallbackMaterials.reference : this.fallbackMaterials.normal;
    material.transparent = isReference;
    material.opacity = isReference ? options.referenceOpacity ?? .28 : 1;
    const fallback = new THREE.Mesh(this.fallbackGeometry, material);
    fallback.position.set(block.position.x + .5, block.position.y + .5, block.position.z + .5);
    fallback.userData['voxel'] = block.position; fallback.userData['renderRole'] = role;
    const entry: RenderedBlockEntry = { key: coordinateKey(block.position), block, signature: `${stableValue(block)}|${role}|${options.referenceOpacity ?? .28}`, role, fallback, revision: 0, object: fallback };
    this.renderedBlocks.set(entry.key, entry); this.blocksGroup.add(fallback);
    if (this.visualProvider && block.kind !== 'missing') {
      const generation = this.providerGeneration; const revision = ++entry.revision;
      this.instrumentation.record('modelResolutions');
      const provider = this.visualProvider!;
      const reusableKey = allowInstancing && role === 'normal' ? provider.reusableVisualKey?.(block, worldContext) : undefined;
      const cachedTemplates = reusableKey ? this.reusableInstanceTemplates.get(reusableKey) : undefined;
      if (cachedTemplates) {
        const instance = this.addInstanceVisualFromTemplates(cachedTemplates, block, entry.key);
        if (instance) {
          this.instrumentation.record('reusableTemplateCacheHits');
          this.blocksGroup.remove(fallback);
          entry.instanceBatchKey = instance.batchKey; entry.instanceIndex = instance.index; entry.object = this.instanceBatches.get(instance.batchKey)!.parts[0];
          onComplete?.(); this.scheduleRender(); return;
        }
      }
      let visualPromise: ReturnType<BlockVisualProvider['create']>;
      this.instrumentation.record('providerObjectCreations');
      try { visualPromise = provider.create(block, worldContext); } catch (error) { visualPromise = Promise.reject(error); }
      void Promise.resolve(visualPromise).then((visual) => {
        if (generation !== this.providerGeneration || this.renderedBlocks.get(entry.key) !== entry || entry.revision !== revision || fallback.parent !== this.blocksGroup) { if (visual.object) disposeObject(visual.object); return; }
        fallback.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics]; fallback.userData['resolvedSupport'] = visual.resolved.support; fallback.userData['renderMode'] = visual.mode; fallback.userData['renderTrace'] = visual.trace;
        if (!visual.object) return;
        const object = visual.object; object.userData['realModel'] = true; applyBlockTheme(object, this.palette); translateVisualToVoxel(object, block.position);
        object.userData['voxel'] = block.position; object.userData['renderRole'] = role; object.userData['realModel'] = true; object.userData['renderMode'] = visual.mode; object.userData['renderTrace'] = visual.trace; object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
        object.traverse((child) => { child.userData['voxel'] = block.position; child.userData['renderRole'] = role; child.userData['realModel'] = true; if (child instanceof THREE.Mesh && isReference) { const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const item of materials) { item.transparent = true; item.opacity = options.referenceOpacity ?? .28; } } });
        const instance = allowInstancing && role === 'normal' ? this.addInstanceVisual(object, block, entry.key, reusableKey) : undefined;
        this.blocksGroup.remove(fallback);
        if (instance) { entry.instanceBatchKey = instance.batchKey; entry.instanceIndex = instance.index; entry.object = this.instanceBatches.get(instance.batchKey)!.parts[0]; disposeObject(object); }
        else { this.blocksGroup.add(object); entry.object = object; }
        this.recordProviderCacheStats(); this.scheduleRender();
      }).catch((error: unknown) => { if (this.renderedBlocks.get(entry.key) !== entry || entry.revision !== revision) return; this.rollbackPartialInstanceVisual(entry.key); fallback.userData['renderMode'] = 'fallback'; fallback.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown visual provider error' }]; this.recordProviderCacheStats(); this.scheduleRender(); }).finally(() => onComplete?.());
    } else onComplete?.();
  }

  private addInstanceVisual(object: THREE.Object3D, block: ProjectDocument['blocks'][number], key: string, reusableKey?: string): { readonly batchKey: string; readonly index: number } | undefined {
    const templates = this.instanceTemplates(object);
    if (!templates) return undefined;
    const retainedTemplates = reusableKey && !this.reusableInstanceTemplates.has(reusableKey) ? cloneInstanceTemplates(templates) : undefined;
    if (retainedTemplates && reusableKey) { this.reusableInstanceTemplates.set(reusableKey, retainedTemplates); this.instrumentation.record('reusableTemplateCreations'); }
    return this.addInstanceVisualFromTemplates(retainedTemplates ?? templates, block, key);
  }

  private addInstanceVisualFromTemplates(templates: readonly InstancePartTemplate[], block: ProjectDocument['blocks'][number], key: string): { readonly batchKey: string; readonly index: number } | undefined {
    const signature = templates.map((template) => { const material = template.material as THREE.Material & { map?: THREE.Texture; color?: THREE.Color; alphaTest?: number; side?: number; vertexColors?: boolean }; return `${template.geometry.uuid}|${material.type}|${material.map?.uuid ?? ''}|${material.color?.getHexString() ?? ''}|${material.alphaTest ?? 0}|${material.side ?? 0}|${material.vertexColors ? 1 : 0}|${template.matrix.elements.map((value) => value.toFixed(4)).join(',')}`; }).join(';');
    const chunk = chunkKey(block.position);
    const batchKey = `${chunk}|${signature}`;
    let batch = this.instanceBatches.get(batchKey);
    if (!batch) {
      const capacity = VIEWPORT_INSTANCE_CHUNK_SIZE ** 3;
      const parts = templates.map((template) => {
        const material = template.material.clone(); material.transparent = false; material.depthWrite = true;
        const mesh = new THREE.InstancedMesh(template.geometry, material, capacity); mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.userData['instanceVoxels'] = []; mesh.userData['instanceKeys'] = []; mesh.userData['realModel'] = true; mesh.userData['instanceBatchKey'] = batchKey; this.blocksGroup.add(mesh); return mesh;
      });
      const envelope = instanceTemplateEnvelope(templates);
      const bounds = stableChunkBounds(chunk, envelope);
      parts.forEach((part) => setStableMeshBounds(part, bounds));
      this.instrumentation.record('instancedBoundsComputations', parts.length);
      batch = { key: batchKey, capacity, templates, parts, keys: [], positions: [] };
      this.instanceBatches.set(batchKey, batch);
      this.instrumentation.record('instancedBatchCreations'); this.instrumentation.record('instancedMeshCount', parts.length);
    }
    if (batch.keys.length >= batch.capacity) return undefined;
    const index = batch.keys.length; batch.keys.push(key); batch.positions.push({ ...block.position });
    const translation = new THREE.Matrix4().makeTranslation(block.position.x, block.position.y, block.position.z);
    batch.parts.forEach((part, partIndex) => { part.setMatrixAt(index, translation.clone().multiply(batch.templates[partIndex].matrix)); part.count = index + 1; (part.userData['instanceVoxels'] as VoxelCoordinate[]).push({ ...block.position }); (part.userData['instanceKeys'] as string[]).push(key); part.instanceMatrix.needsUpdate = true; });
    this.instrumentation.record('instancedBlockAdds'); this.instrumentation.record('instancedMembers');
    return { batchKey, index };
  }

  private instanceTemplates(object: THREE.Object3D): readonly InstancePartTemplate[] | undefined {
    if (object.userData['specialVisualFamily'] || object.userData['fluidKind'] || object.userData['fluidRenderLayer']) return undefined;
    object.updateMatrixWorld(true);
    const rootInverse = object.matrixWorld.clone().invert();
    const bounds = new THREE.Box3().setFromObject(object); const size = bounds.getSize(new THREE.Vector3());
    if (Math.abs(size.x - 1) > .02 || Math.abs(size.y - 1) > .02 || Math.abs(size.z - 1) > .02) return undefined;
    const templates: InstancePartTemplate[] = [];
    let compatible = true;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !compatible) return;
      if (child.userData['specialVisualFamily'] || child.userData['fluidKind'] || child.userData['fluidRenderLayer']) { compatible = false; return; }
      const material = Array.isArray(child.material) ? undefined : child.material;
      if (!material || material.transparent || material.depthWrite === false || child.morphTargetInfluences || child.type === 'SkinnedMesh') { compatible = false; return; }
      templates.push({ geometry: child.geometry, material, matrix: rootInverse.clone().multiply(child.matrixWorld) });
    });
    return compatible && templates.length > 0 ? templates : undefined;
  }

  private removeInstanceVisual(key: string, entry: RenderedBlockEntry): void {
    const batchKey = entry.instanceBatchKey; const index = entry.instanceIndex;
    if (!batchKey || index === undefined) return;
    const batch = this.instanceBatches.get(batchKey); if (!batch) return;
    const last = batch.keys.length - 1; const removedKey = batch.keys[index];
    if (index !== last) {
      const movedKey = batch.keys[last]; batch.keys[index] = movedKey; batch.positions[index] = batch.positions[last];
      const movedEntry = this.renderedBlocks.get(movedKey); if (movedEntry) movedEntry.instanceIndex = index;
      const movedPosition = batch.positions[index]; const translation = new THREE.Matrix4().makeTranslation(movedPosition.x, movedPosition.y, movedPosition.z);
      batch.parts.forEach((part, partIndex) => { part.setMatrixAt(index, translation.clone().multiply(batch.templates[partIndex].matrix)); const voxels = part.userData['instanceVoxels'] as VoxelCoordinate[]; const keys = part.userData['instanceKeys'] as string[]; voxels[index] = { ...movedPosition }; keys[index] = movedKey; part.instanceMatrix.needsUpdate = true; });
    }
    batch.keys.pop(); batch.positions.pop(); batch.parts.forEach((part) => { (part.userData['instanceVoxels'] as VoxelCoordinate[]).pop(); (part.userData['instanceKeys'] as string[]).pop(); part.count = batch.keys.length; part.instanceMatrix.needsUpdate = true; });
    this.instrumentation.record('instancedBlockRemovals'); this.instrumentation.record('instancedMembers', -1);
    if (!batch.keys.length) { for (const part of batch.parts) { this.blocksGroup.remove(part); (part.material as THREE.Material).dispose(); } this.instanceBatches.delete(batchKey); this.instrumentation.record('instancedMeshCount', -batch.parts.length); }
    void removedKey;
  }

  private removeBlockEntry(key: string, entry: RenderedBlockEntry): void { entry.revision += 1; if (entry.instanceBatchKey) this.removeInstanceVisual(key, entry); else { if (entry.object.parent === this.blocksGroup) this.blocksGroup.remove(entry.object); if (entry.object !== entry.fallback) disposeObject(entry.object); else disposeObject(entry.fallback); } this.renderedBlocks.delete(key); }

  private recordProviderCacheStats(): void {
    const stats = this.visualProvider?.cacheStats?.(); if (!stats) return;
    const previous = this.providerStats;
    for (const key of ['resolvedModelCacheHits', 'resolvedModelCacheMisses', 'geometryCacheHits', 'geometryCacheMisses', 'textureCacheHits', 'textureCacheMisses'] as const) this.instrumentation.record(key, Math.max(0, stats[key] - (previous?.[key] ?? 0)));
    this.providerStats = stats;
  }

  private clearReusableInstanceTemplates(): void {
    for (const templates of this.reusableInstanceTemplates.values()) for (const template of templates) template.material.dispose();
    this.reusableInstanceTemplates.clear();
  }

  private clearPersistentVisuals(): void { for (const [key, entry] of this.renderedBlocks) this.removeBlockEntry(key, entry); for (const [key, entry] of this.renderedDecorations) this.removeDecorationEntry(key, entry); this.clearPlaceholderVisuals(); this.clearReusableInstanceTemplates(); this.pendingHydrationSignatures.clear(); this.placeholderSignatures.clear(); this.pendingDecorationSignatures.clear(); this.structureSyncKey = ''; this.decorationSyncKey = ''; this.syncedProject = undefined; this.syncedBlockCount = undefined; this.syncedBlocksReference = undefined; this.syncedDecorationProject = undefined; }

  private reconcileDecorations(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean): void {
    if (!project) {
      for (const [id, entry] of this.renderedDecorations) this.removeDecorationEntry(id, entry);
      this.cancelDecorationHydration();
      return;
    }
    const visible = (project.decorations ?? []).filter((decoration) => isDecorationVisible(decoration, project.groups) && (!options.isolatedGroupId || decorationHasGroup(decoration, options.isolatedGroupId)) && (options.layerY === undefined || decoration.anchor.y === options.layerY || options.visibility === 'whole-structure' || options.visibility === 'all-below' && decoration.anchor.y <= (options.layerY ?? decoration.anchor.y)));
    const map = new Map(visible.map((decoration) => [decoration.instanceId, decoration] as const));
    this.decorationHydrationQueue = this.decorationHydrationQueue.filter((job) => stableValue(map.get(job.id)) === stableValue(job.decoration));
    for (const [id, entry] of this.renderedDecorations) if (!map.has(id)) { this.removeDecorationEntry(id, entry); this.pendingDecorationSignatures.delete(id); this.instrumentation.record('decorationRemovals'); }
    for (const id of this.pendingDecorationSignatures.keys()) if (!map.has(id)) this.pendingDecorationSignatures.delete(id);
    for (const [id, decoration] of map) {
      const signature = `${stableValue(decoration)}|${this.decorationRevision}`; const current = this.renderedDecorations.get(id);
      const pendingSignature = this.pendingDecorationSignatures.get(id);
      if ((!full && current?.signature === signature) || (!current && pendingSignature === signature)) continue;
      if (current) { this.removeDecorationEntry(id, current); this.instrumentation.record('decorationUpdates'); }
      else if (pendingSignature === undefined) this.instrumentation.record('decorationAdds');
      else this.instrumentation.record('decorationUpdates');
      this.pendingDecorationSignatures.set(id, signature);
      this.decorationHydrationQueue.push({ token: this.hydrationGeneration, id, decoration, signature });
    }
    this.scheduleHydrationPump();
  }

  private removeDecorationEntry(id: string, entry: RenderedDecorationEntry): void { if (entry.object.parent === this.decorationsGroup) this.decorationsGroup.remove(entry.object); disposeObject(entry.object); this.renderedDecorations.delete(id); }

  private hydrateDecorationItemPreview(entry: RenderedDecorationEntry): void {
    const provider = this.decorationItemPreview;
    const item = entry.decoration.item;
    if (!provider || !item || entry.id !== this.renderOptions.selectedDecorationId) return;
    const sprite = entry.object.children.find((child) => child.userData['decorationItemId'] === item.id);
    if (!sprite) return;
    const generation = this.providerGeneration;
    void provider(item).then((url) => {
      if (!url || generation !== this.providerGeneration || this.renderedDecorations.get(entry.id) !== entry) return;
      if (sprite.userData['itemVisualPreview'] === url) return;
      if (applyDecorationItemPreview(sprite, url, this.decorationTextureCache)) this.render();
    }).catch(() => undefined);
  }

  private updateDecorationSelection(selectedId: string | undefined): void {
    for (const child of [...this.decorationSelectionGroup.children]) { disposeObject(child); this.decorationSelectionGroup.remove(child); }
    if (!selectedId) return;
    const entry = this.renderedDecorations.get(selectedId); if (!entry) return;
    const bounds = new THREE.Box3().setFromObject(entry.object);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.04, bounds.max.x - bounds.min.x + .05), Math.max(.04, bounds.max.y - bounds.min.y + .05), Math.max(.04, bounds.max.z - bounds.min.z + .05))), new THREE.LineBasicMaterial({ color: this.palette.selection, depthTest: false, depthWrite: false }));
    outline.position.copy(bounds.getCenter(new THREE.Vector3())); outline.userData['decorationInstanceId'] = selectedId; outline.renderOrder = 2001; this.decorationSelectionGroup.add(outline);
  }

  hit(event: PointerEvent, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    if (!this.renderer || !this.container || !project) return { status: 'invalid' };
    this.flushInstanceBatchBounds();
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
    } else if (blockHit) {
      block = blockCoordinateFromHit(blockHit);
      if (block) {
        const normal = (blockHit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().transformDirection(blockHit.object.matrixWorld);
        faceNormal = { x: normal.x, y: normal.y, z: normal.z };
        hitPoint = blockHit.point;
        const attachment = resolveAttachmentPlacement(active?.id, block, hitPoint, project.blocks, this.definitionResolver);
        target = attachment?.target ?? targetFromBlockFace(block, normal as FaceNormal);
        if (attachment) faceNormal = { x: 0, y: attachment.snapType === 'chain-extension' ? 1 : -1, z: 0 };
      }
    } else if (this.ground) {
      const groundHit = this.raycaster.intersectObject(this.ground, false)[0];
      if (groundHit) { target = targetFromGridHit(groundHit.point); faceNormal = { x: 0, y: 1, z: 0 }; hitPoint = groundHit.point; }
    }
    if (blockHit) {
      const hitVoxel = blockCoordinateFromHit(blockHit);
      if (hitVoxel && (planeY === undefined || hitVoxel.y === planeY)) block = hitVoxel;
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

  /** Projects a pointer ray onto the face plane captured at the beginning of a 3D selection drag. */
  projectPointerToPlane(event: PointerEvent, plane: FaceLockedSelectionPlane): { readonly x: number; readonly y: number; readonly z: number } | undefined {
    if (!this.renderer || !this.container) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    const component = direction[plane.axis];
    if (Math.abs(component) < 1e-8) return undefined;
    const distance = (plane.coordinate - origin[plane.axis]) / component;
    if (distance < 0) return undefined;
    const point = this.raycaster.ray.at(distance, new THREE.Vector3());
    return { x: point.x, y: point.y, z: point.z };
  }

  /** Projects an empty-space selection gesture onto a camera-facing world plane. */
  projectPointerToFreeSpace(event: PointerEvent, project: ProjectDocument, plane?: FreeSpaceSelectionPlane): { readonly point: { readonly x: number; readonly y: number; readonly z: number }; readonly plane: FreeSpaceSelectionPlane } | undefined {
    if (!this.renderer || !this.container) return undefined;
    const resolvedPlane = plane ?? freeSpaceSelectionPlane(project.size, this.camera.getWorldDirection(new THREE.Vector3()));
    const point = this.projectPointerToAxisPlane(event, resolvedPlane.axis, resolvedPlane.coordinate);
    return point ? { point, plane: resolvedPlane } : undefined;
  }

  private projectPointerToAxisPlane(event: PointerEvent, axis: 'x' | 'y' | 'z', coordinate: number): { readonly x: number; readonly y: number; readonly z: number } | undefined {
    if (!this.renderer || !this.container) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    const component = direction[axis];
    if (Math.abs(component) < 1e-8) return undefined;
    const distance = (coordinate - origin[axis]) / component;
    if (distance < 0) return undefined;
    const point = this.raycaster.ray.at(distance, new THREE.Vector3());
    return { x: point.x, y: point.y, z: point.z };
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
    if (typeof document !== 'undefined') { document.removeEventListener('focusin', this.onWindowBlur); document.removeEventListener('visibilitychange', this.onVisibilityChange); }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onWindowBlur);
    this.clearInput();
    this.cancelHydration();
    const provider = this.visualProvider;
    if (this.renderTimer !== undefined) { clearTimeout(this.renderTimer); this.renderTimer = undefined; this.renderScheduled = false; }
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    for (const child of this.blocksGroup.children) disposeObject(child);
    this.blocksGroup.clear();
    this.instanceBatches.clear();
    this.clearReusableInstanceTemplates();
    for (const child of this.decorationsGroup.children) disposeObject(child);
    this.decorationsGroup.clear();
    for (const child of [...this.logicalSelectionGroup.children]) this.logicalSelectionGroup.remove(child);
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
    this.logicalSelectionGeometry.dispose();
    this.logicalSelectionMaterial.dispose();
    this.groupHighlightGeometry.dispose();
    this.groupHighlightMaterial.dispose();
    this.selectionBox.geometry.dispose();
    (this.selectionBox.material as THREE.Material).dispose();
    if (this.ghostModel) disposeObject(this.ghostModel);
    this.fallbackGeometry.dispose();
    this.fallbackMaterials.normal.dispose(); this.fallbackMaterials.reference.dispose(); this.fallbackMaterials.missing.dispose();
    this.clearPlaceholderVisuals();
    this.placeholderGeometry.dispose();
    this.placeholderMaterials.normal.dispose(); this.placeholderMaterials.reference.dispose(); this.placeholderMaterials.missing.dispose();
    provider?.release?.();
    this.visualProvider = undefined;
    this.renderer = undefined;
    this.container = undefined;
  }

  diagnostics(): ViewportDiagnostics {
    return { initialized: !!this.renderer, disposed: this.disposed, canvasWidth: this.canvasSize.width, canvasHeight: this.canvasSize.height, gridExists: !!this.projectGrid, boundsExists: !!this.boundsBox, rendererExists: !!this.renderer, sceneExists: true, cameraExists: true, controlsExist: !!this.controls, themeApplied: this.themeApplied, resizeApplied: this.canvasSize.width > 0 && this.canvasSize.height > 0, renderMode: 'demand', renderCount: this.renderCount };
  }

  visibleSceneDiagnostics(): VisibleSceneDiagnostics {
    const expected = this.project ? this.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedKeys = [...new Set(expected.map((entry) => coordinateKey(entry.block.position)))];
    const expectedSet = new Set(expectedKeys);
    const renderedVoxelKeys = [...this.renderedBlocks.keys()].filter((key) => expectedSet.has(key));
    const placeholderVoxelKeys = [...this.placeholderIndices.keys()].filter((key) => expectedSet.has(key));
    const pendingVoxelKeys = [...this.pendingHydrationSignatures.keys()].filter((key) => expectedSet.has(key));
    const representedVoxelKeys = [...new Set([...renderedVoxelKeys, ...placeholderVoxelKeys])];
    return {
      expectedVisibleVoxelCount: expectedKeys.length,
      renderedVoxelCount: renderedVoxelKeys.length,
      placeholderVoxelCount: placeholderVoxelKeys.length,
      pendingVoxelCount: pendingVoxelKeys.length,
      expectedVoxelKeys: expectedKeys,
      renderedVoxelKeys,
      placeholderVoxelKeys,
      pendingVoxelKeys,
      representedVoxelKeys,
    };
  }

  ownershipDiagnostics(): readonly ViewportVoxelOwnershipDiagnostic[] {
    const expected = this.project ? new Set(this.visibleBlocks(this.project, this.renderOptions).map((entry) => coordinateKey(entry.block.position))) : new Set<string>();
    const queued = new Set(this.hydrationQueue.map((job) => job.key));
    const keys = new Set([...expected, ...this.renderedBlocks.keys(), ...this.placeholderIndices.keys(), ...this.pendingHydrationSignatures.keys(), ...this.placeholderSignatures.keys(), ...queued, ...this.runningHydrationKeys.keys()]);
    return [...keys].sort().map((coordinateKeyValue) => ({
      coordinateKey: coordinateKeyValue,
      expectedVisible: expected.has(coordinateKeyValue),
      renderedEntry: this.renderedBlocks.has(coordinateKeyValue),
      placeholderEntry: this.placeholderIndices.has(coordinateKeyValue),
      ...(this.pendingHydrationSignatures.has(coordinateKeyValue) ? { pendingSignature: this.pendingHydrationSignatures.get(coordinateKeyValue) } : {}),
      queuedJob: queued.has(coordinateKeyValue),
      ...(this.runningHydrationKeys.has(coordinateKeyValue) ? { runningGeneration: this.runningHydrationKeys.get(coordinateKeyValue) } : {}),
    }));
  }

  rendererOwnershipDiagnostics(): ViewportOwnershipDiagnostics {
    const expected = this.project ? this.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedKeys = new Set(expected.map((entry) => coordinateKey(entry.block.position)));
    const staleKeys = new Set<string>();
    const addStale = (key: string): void => { if (!expectedKeys.has(key)) staleKeys.add(key); };
    for (const key of this.renderedBlocks.keys()) addStale(key);
    for (const key of this.placeholderIndices.keys()) addStale(key);
    for (const key of this.pendingHydrationSignatures.keys()) addStale(key);
    for (const key of this.placeholderSignatures.keys()) addStale(key);
    for (const job of this.hydrationQueue) addStale(job.key);
    for (const key of this.runningHydrationKeys.keys()) addStale(key);

    const batchInvariantViolations: string[] = [];
    let instanceMemberCount = 0;
    for (const [batchKey, batch] of this.instanceBatches) {
      instanceMemberCount += batch.keys.length;
      if (batch.keys.length !== batch.positions.length) batchInvariantViolations.push(`${batchKey}: keys/positions length mismatch`);
      for (const [partIndex, part] of batch.parts.entries()) {
        const keys = part.userData['instanceKeys'] as unknown;
        const voxels = part.userData['instanceVoxels'] as unknown;
        if (!Array.isArray(keys) || keys.length !== batch.keys.length) batchInvariantViolations.push(`${batchKey}: part ${partIndex} keys length mismatch`);
        if (!Array.isArray(voxels) || voxels.length !== batch.keys.length) batchInvariantViolations.push(`${batchKey}: part ${partIndex} voxels length mismatch`);
        if (part.count !== batch.keys.length) batchInvariantViolations.push(`${batchKey}: part ${partIndex} count mismatch`);
        if (Array.isArray(keys)) for (const key of keys) addStale(key);
        if (Array.isArray(voxels)) for (const voxel of voxels) {
          if (voxel && typeof voxel === 'object' && typeof (voxel as VoxelCoordinate).x === 'number') addStale(coordinateKey(voxel as VoxelCoordinate));
        }
      }
      for (const [index, key] of batch.keys.entries()) {
        const entry = this.renderedBlocks.get(key);
        if (!entry || entry.instanceBatchKey !== batchKey || entry.instanceIndex !== index) batchInvariantViolations.push(`${batchKey}: ownership mismatch at ${index} (${key})`);
      }
    }

    let placeholderVisualCount = 0;
    for (const batch of this.placeholderBatches.values()) {
      placeholderVisualCount += batch.keys.length;
      if (batch.keys.length !== batch.positions.length || batch.mesh.count !== batch.keys.length) batchInvariantViolations.push(`${batch.key}: placeholder length/count mismatch`);
      for (const key of batch.keys) addStale(key);
    }

    const outsideBlocksGroupOwners: string[] = [];
    const outsideMeshSample: ViewportVisibleMeshDiagnostic[] = [];
    const insideMeshSample: ViewportVisibleMeshDiagnostic[] = [];
    let visibleMeshCount = 0;
    const isVisibleInScene = (object: THREE.Object3D): boolean => {
      for (let current: THREE.Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
      return true;
    };
    const voxelFromObject = (object: THREE.Object3D): string | undefined => {
      const voxel = object.userData['voxel'] as VoxelCoordinate | undefined;
      return voxel && typeof voxel.x === 'number' && typeof voxel.y === 'number' && typeof voxel.z === 'number' ? coordinateKey(voxel) : undefined;
    };
    const isOwnedByBlocksGroup = (object: THREE.Object3D): boolean => {
      for (let current = object.parent; current; current = current.parent) if (current === this.blocksGroup) return true;
      return false;
    };
    const sceneOwner = (object: THREE.Object3D): string => {
      let root = object;
      while (root.parent && root.parent !== this.scene) root = root.parent;
      const known: readonly [THREE.Object3D | undefined, string][] = [
        [this.blocksGroup, 'blocksGroup'], [this.decorationsGroup, 'decorationsGroup'], [this.ghost, 'ghost'],
        [this.ghostModel, 'ghostModel'], [this.movePreviewGroup, 'movePreviewGroup'], [this.decorationGhostGroup, 'decorationGhostGroup'],
        [this.decorationSelectionGroup, 'decorationSelectionGroup'], [this.logicalSelectionGroup, 'logicalSelectionGroup'],
      ];
      if (root === this.blocksGroup) {
        if (object instanceof THREE.InstancedMesh && object.userData['placeholder'] === true) return 'placeholderBatches';
        if (object instanceof THREE.InstancedMesh && object.userData['instanceBatchKey'] !== undefined) return 'instanceBatches';
        const key = voxelFromObject(object);
        if (key && this.renderedBlocks.get(key)?.fallback === object) return 'fallback mesh';
      }
      return known.find(([candidate]) => candidate === root)?.[1] ?? (root.name || root.type);
    };
    const diagnosticValue = (value: unknown): unknown => {
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
      if (Array.isArray(value)) return value.slice(0, 8).map(diagnosticValue);
      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record['x'] === 'number' && typeof record['y'] === 'number' && typeof record['z'] === 'number') return { x: record['x'], y: record['y'], z: record['z'] };
        if (typeof record['id'] === 'string') return { id: record['id'], state: diagnosticValue(record['state']) };
        return `[${(value as object).constructor?.name ?? 'Object'}]`;
      }
      return String(value);
    };
    const materialDiagnostics = (material: THREE.Material): ViewportVisibleMeshDiagnostic['materials'][number] => {
      const textured = material as THREE.Material & { readonly map?: THREE.Texture; readonly opacity?: number };
      const texture = textured.map;
      const textureImage = texture?.image as { readonly src?: string; readonly currentSrc?: string; readonly name?: string } | undefined;
      return {
        uuid: material.uuid,
        type: material.type,
        visible: material.visible,
        opacity: textured.opacity ?? 1,
        ...(texture ? { texture: { uuid: texture.uuid, sourceUuid: texture.source.uuid, ...(textureImage?.currentSrc || textureImage?.src || textureImage?.name ? { sourceIdentity: textureImage.currentSrc || textureImage.src || textureImage.name } : {}) } } : {}),
      };
    };
    const directSceneChildren = this.scene.children.map((child) => ({ owner: sceneOwner(child), uuid: child.uuid, visible: child.visible, childCount: child.children.length }));
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !isVisibleInScene(object)) return;
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(materialDiagnostics);
      if (materials.every((material) => !material.visible || material.opacity <= 0)) return;
      if (object instanceof THREE.InstancedMesh && object.count === 0) return;
      visibleMeshCount += 1;
      const owner = sceneOwner(object);
      const ownedByBlocksGroup = isOwnedByBlocksGroup(object);
      if (!ownedByBlocksGroup) {
        outsideBlocksGroupOwners.push(`${owner}/${object.type}:${object.uuid}`);
        const key = voxelFromObject(object); if (key) addStale(key);
      }
      const sample = ownedByBlocksGroup ? insideMeshSample : outsideMeshSample;
      if (sample.length >= 24) return;
      object.updateWorldMatrix(true, false);
      const parentPath: ViewportVisibleMeshDiagnostic['parentPath'][number][] = [];
      for (let current: THREE.Object3D | null = object; current; current = current.parent) {
        parentPath.push({ type: current.type, name: current.name, uuid: current.uuid, visible: current.visible });
        if (current === this.scene) break;
      }
      const worldPosition = object.getWorldPosition(new THREE.Vector3());
      sample.push({
        owner,
        objectType: object.type,
        uuid: object.uuid,
        parentPath: parentPath.reverse(),
        localPosition: vectorValue(object.position),
        worldPosition: vectorValue(worldPosition),
        matrixWorld: object.matrixWorld.toArray(),
        geometry: { uuid: object.geometry.uuid, type: object.geometry.type },
        materials,
        userData: Object.fromEntries(Object.entries(object.userData).map(([key, value]) => [key, diagnosticValue(value)])),
        ...(object instanceof THREE.InstancedMesh ? { instanceCount: object.count } : {}),
      });
    });

    return {
      authoritativeVisibleBlockCount: expectedKeys.size,
      authoritativeProjectBlockCount: this.project?.blocks.length ?? 0,
      renderedBlockCount: this.renderedBlocks.size,
      placeholderVisualCount,
      instanceBatchCount: this.instanceBatches.size,
      instanceMemberCount,
      placeholderBatchCount: this.placeholderBatches.size,
      placeholderIndexCount: this.placeholderIndices.size,
      blocksGroupChildCount: this.blocksGroup.children.length,
      blockLikeSceneObjectsOutsideBlocksGroup: outsideBlocksGroupOwners.length,
      visibleMeshesOutsideBlocksGroup: outsideBlocksGroupOwners.length,
      staleVoxelKeys: [...staleKeys].sort(),
      batchInvariantViolations,
      outsideBlocksGroupOwners,
      visibleMeshCount,
      visibleMeshSample: [...outsideMeshSample, ...insideMeshSample].slice(0, 32),
      visibleMeshesOutsideBlocksGroupSample: outsideMeshSample,
      directSceneChildren,
      previewState: {
        ghostVisible: this.ghost.visible,
        ghostModelPresent: !!this.ghostModel,
        ghostModelVisible: !!this.ghostModel?.visible,
        ghostModelKey: this.ghostModelKey,
        ghostGeneration: this.ghostGeneration,
        ...(this.ghostTarget ? { ghostTarget: { ...this.ghostTarget } } : {}),
        movePreviewChildren: this.movePreviewGroup.children.length,
        decorationGhostChildren: this.decorationGhostGroup.children.length,
        logicalSelectionChildren: this.logicalSelectionGroup.children.length,
        selectionOutlineVisible: this.selectionOutline.visible,
        reusableTemplateCount: this.reusableInstanceTemplates.size,
      },
      hydrationState: {
        queued: this.hydrationQueue.length + this.decorationHydrationQueue.length,
        running: this.hydrationRunning,
        pendingSignatureCount: this.pendingHydrationSignatures.size,
        placeholderSignatureCount: this.placeholderSignatures.size,
        runningOwnershipCount: this.runningHydrationKeys.size,
      },
    };
  }

  rendererCounters(): RendererCounters {
    return this.instrumentation.snapshot();
  }

  performanceEvidence(): ViewportPerformanceEvidence {
    let object3dCount = 0;
    let meshCount = 0;
    this.scene.traverse((object) => { object3dCount += 1; if (object instanceof THREE.Mesh) meshCount += 1; });
    const info = this.renderer?.info;
    const counters = this.instrumentation.snapshot();
    return {
      renderCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
      renderedBlocks: this.renderedBlocks.size,
      renderedDecorations: this.renderedDecorations.size,
      object3dCount,
      meshCount,
      instanceMeshCount: counters.instancedMeshCount,
      instanceMembers: counters.instancedMembers,
      providerObjectCreations: counters.providerObjectCreations,
      reusableTemplateCreations: counters.reusableTemplateCreations,
      reusableTemplateCacheHits: counters.reusableTemplateCacheHits,
      instancedBoundsComputations: counters.instancedBoundsComputations,
      hydrationQueue: this.hydrationQueue.length + this.decorationHydrationQueue.length,
      hydrationRunning: this.hydrationRunning,
      frameDurationMs: this.frameDurationMs,
    };
  }

  hydrationProgress(): ViewportHydrationProgress { return this.hydrationProgressState; }

  hydrationDiagnostics(): ViewportHydrationDiagnostics {
    const currentGenerationRunning = this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0;
    const visibleEntries = this.project ? this.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedVisibleBlockCount = visibleEntries.length;
    const queuedKeys = new Set(this.hydrationQueue.filter((job) => job.token === this.hydrationGeneration).map((job) => job.key));
    const orphanedHydrationSample: string[] = [];
    let orphanedHydrationCount = 0;
    if (this.visualProvider && this.project) {
      for (const entry of visibleEntries) {
        const key = coordinateKey(entry.block.position);
        const rendered = this.renderedBlocks.get(key);
        const isFinal = !!rendered && (rendered.object !== rendered.fallback || rendered.instanceBatchKey !== undefined || rendered.fallback.userData['renderMode'] !== undefined);
        if (entry.block.kind === 'missing' || isFinal || queuedKeys.has(key) || this.runningHydrationKeys.get(key) === this.hydrationGeneration) continue;
        if (this.pendingHydrationSignatures.has(key) || this.placeholderSignatures.has(key) || this.placeholderIndices.has(key) || !!rendered) {
          orphanedHydrationCount += 1;
          if (orphanedHydrationSample.length < 12) orphanedHydrationSample.push(key);
        }
      }
    }
    const runningByGeneration = Object.fromEntries([...this.hydrationRunningByGeneration.entries()].map(([generation, count]) => [String(generation), count]));
    return {
      generation: this.hydrationGeneration,
      queued: this.hydrationQueue.length + this.decorationHydrationQueue.length,
      running: this.hydrationRunning,
      globalRunning: this.hydrationRunning,
      currentGenerationRunning,
      staleRunning: Math.max(0, this.hydrationRunning - currentGenerationRunning),
      hydrationScheduled: this.hydrationScheduled,
      hydrationTimerActive: this.hydrationTimer !== undefined,
      hydrationBatchBudget: this.hydrationBatchBudget,
      pendingSignatureCount: this.pendingHydrationSignatures.size,
      placeholderSignatureCount: this.placeholderSignatures.size,
      placeholderVisualCount: this.placeholderIndices.size,
      renderedBlockCount: this.renderedBlocks.size,
      expectedVisibleBlockCount,
      runningOwnershipCount: this.runningHydrationKeys.size,
      runningByGeneration,
      orphanedHydrationCount,
      orphanedHydrationSample,
      completed: this.hydrationProgressState.completed,
      total: this.hydrationProgressState.total,
      scheduled: this.hydrationScheduled || this.hydrationTimer !== undefined,
    };
  }

  onHydrationProgress(listener: (progress: ViewportHydrationProgress) => void): () => void {
    this.hydrationProgressListeners.add(listener);
    listener(this.hydrationProgressState);
    return () => this.hydrationProgressListeners.delete(listener);
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
    const visual = createDecorationVisual(candidate, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual, false);
    visual.renderOrder = 2000;
    visual.traverse((object) => { object.renderOrder = 2000; if (object instanceof THREE.Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material.transparent = true; material.opacity = .5; material.depthWrite = false; material.depthTest = false; } } });
    const bounds = new THREE.Box3().setFromObject(visual); const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bounds.max.x - bounds.min.x + .05, bounds.max.y - bounds.min.y + .05, bounds.max.z - bounds.min.z + .05)), new THREE.LineBasicMaterial({ color: status === 'valid' ? this.palette.valid : this.palette.invalid, depthTest: false, depthWrite: false })); outline.position.copy(bounds.getCenter(new THREE.Vector3())); outline.renderOrder = 2001; visual.add(outline); this.decorationGhostGroup.add(visual); this.render();
  }
  clearInput(): void { this.pressedActions.clear(); if (this.cameraMoveFrame !== undefined) { cancelAnimationFrame(this.cameraMoveFrame); this.cameraMoveFrame = undefined; } }
  /** Restores OrbitControls mappings when an editor gesture captured the parent host. */
  endEditorPointerGesture(): void { this.restoreTemporaryMouseButton(); }
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

  private updateSelection(selected: VoxelCoordinate | undefined, selectedPositions: readonly VoxelCoordinate[] | undefined, kind: string | undefined, count: number | undefined, aggregateBounds: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined, box: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined): void {
    const positions = selectedPositions ?? [];
    const selectedCount = count ?? positions.length;
    const aggregate = kind === 'all' || selectedCount > DETAILED_SELECTION_OUTLINE_LIMIT ? aggregateBounds : undefined;
    (this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(this.palette.selection);
    this.logicalSelectionMaterial.color.setHex(this.palette.selection);
    (this.selectionBox.material as THREE.LineBasicMaterial).color.setHex(this.palette.selection);
    const unchanged = this.lastSelectionPositions === selectedPositions && this.lastSelectionBounds === aggregate && this.lastSelectionKind === kind && this.lastSelectionCount === selectedCount && sameVoxel(this.lastSelected, selected) && this.lastSelectionBox === box;
    if (unchanged) return;
    this.lastSelectionPositions = selectedPositions;
    this.lastSelectionBounds = aggregate;
    this.lastSelectionKind = kind;
    this.lastSelectionCount = selectedCount;
    this.lastSelected = selected;
    this.lastSelectionBox = box;
    for (const child of [...this.logicalSelectionGroup.children]) this.logicalSelectionGroup.remove(child);
    this.selectionOutline.visible = !!selected && !positions.length && !aggregate;
    if (selected) this.selectionOutline.position.set(selected.x + .5, selected.y + .5, selected.z + .5);
    const visualBox = aggregate ?? box;
    this.selectionBox.visible = !!visualBox;
    if (visualBox) this.selectionBox.box.set(new THREE.Vector3(visualBox.min.x, visualBox.min.y, visualBox.min.z), new THREE.Vector3(visualBox.max.x + 1, visualBox.max.y + 1, visualBox.max.z + 1));
    if (aggregate) return;
    for (const position of positions) { const outline = new THREE.LineSegments(this.logicalSelectionGeometry, this.logicalSelectionMaterial); outline.position.set(position.x + .5, position.y + .5, position.z + .5); outline.renderOrder = 2001; this.logicalSelectionGroup.add(outline); }
  }

  private updateActiveGroup(project: ProjectDocument | undefined, activeGroupId: string | undefined, positions: readonly VoxelCoordinate[] | undefined): void {
    for (const child of [...this.scene.children]) {
      if (child.userData['groupHighlight']) { child.traverse((object) => { if (object instanceof THREE.LineSegments && !object.userData['sharedGroupHighlight']) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.scene.remove(child); }
    }
    if (!project || !activeGroupId) return;
    const group = project.groups.find((entry) => entry.id === activeGroupId);
    const color = group?.locked ? this.palette.lockedGroup : this.palette.group;
    this.groupHighlightMaterial.color.setHex(color);
    const visiblePositions = positions ?? [];
    const aggregateGroup = visiblePositions.length > DETAILED_SELECTION_OUTLINE_LIMIT;
    if (aggregateGroup) {
      const bounds = boundsOfPositions(visiblePositions);
      if (bounds) {
        const aggregate = new THREE.LineSegments(this.groupHighlightGeometry, this.groupHighlightMaterial);
        aggregate.position.set((bounds.min.x + bounds.max.x + 1) / 2, (bounds.min.y + bounds.max.y + 1) / 2, (bounds.min.z + bounds.max.z + 1) / 2);
        aggregate.scale.set(bounds.max.x - bounds.min.x + 1, bounds.max.y - bounds.min.y + 1, bounds.max.z - bounds.min.z + 1);
        aggregate.userData['groupHighlight'] = true; aggregate.userData['sharedGroupHighlight'] = true; aggregate.renderOrder = 1000; this.scene.add(aggregate);
      }
    }
    const positionKeys = new Set(positions?.map((position) => `${position.x},${position.y},${position.z}`));
    const isolatedKeys = new Set(this.renderOptions.isolatedGroupPositions?.map((position) => `${position.x},${position.y},${position.z}`));
    for (const block of aggregateGroup ? [] : project.blocks.filter((entry) => positionKeys.has(`${entry.position.x},${entry.position.y},${entry.position.z}`) && isBlockVisible(entry, project.groups) && (!this.renderOptions.isolatedGroupId || isolatedKeys.has(`${entry.position.x},${entry.position.y},${entry.position.z}`)))) {
      const outline = new THREE.LineSegments(this.groupHighlightGeometry, this.groupHighlightMaterial);
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
      const visual = createDecorationVisual(decoration, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual, false);
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

  private render(): void {
    this.flushInstanceBatchBounds();
    if (!this.renderer) return;
    const now = performance.now();
    if (this.lastRenderTimestamp > 0) this.frameDurationMs = this.frameDurationMs === 0 ? now - this.lastRenderTimestamp : this.frameDurationMs * .8 + (now - this.lastRenderTimestamp) * .2;
    this.lastRenderTimestamp = now;
    this.renderer.render(this.scene, this.camera);
    this.renderCount++;
  }

  /** Chunk bounds are conservative and assigned once at batch creation. */
  private flushInstanceBatchBounds(): void { }

  private startCameraMovement(): void { if (this.cameraMoveFrame !== undefined) return; let previous = performance.now(); const step = (now: number) => { this.cameraMoveFrame = undefined; const delta = Math.min((now - previous) / 1000, .1); previous = now; this.moveCamera(this.pressedActions, delta); if (this.pressedActions.size) this.cameraMoveFrame = requestAnimationFrame(step); }; this.cameraMoveFrame = requestAnimationFrame(step); }
  private moveCamera(keys: ReadonlySet<MovementAction>, delta: number): void {
    if (!this.controls || !keys.size) return;
    this.cameraInteractingUntil = performance.now() + 180;
    const direction = cameraActionMovementDelta(keys, this.camera, this.controlConfiguration.cameraMoveSpeed, this.controlConfiguration.verticalMoveSpeed, delta);
    if (!direction.lengthSq()) return;
    this.camera.position.add(direction);
    this.controls.target.add(direction);
    this.controls.update();
    // Keyboard movement does not always produce an OrbitControls `change`
    // event, so demand rendering must be driven explicitly for every camera
    // frame.
    this.render();
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

const DETAILED_SELECTION_OUTLINE_LIMIT = 256;
function sameVoxel(left: VoxelCoordinate | undefined, right: VoxelCoordinate | undefined): boolean { return left?.x === right?.x && left?.y === right?.y && left?.z === right?.z; }
function boundsOfPositions(positions: readonly VoxelCoordinate[]): { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined {
  if (!positions.length) return undefined;
  let minX = positions[0].x; let minY = positions[0].y; let minZ = positions[0].z; let maxX = minX; let maxY = minY; let maxZ = minZ;
  for (let index = 1; index < positions.length; index += 1) { const position = positions[index]; minX = Math.min(minX, position.x); minY = Math.min(minY, position.y); minZ = Math.min(minZ, position.z); maxX = Math.max(maxX, position.x); maxY = Math.max(maxY, position.y); maxZ = Math.max(maxZ, position.z); }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
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
function cameraActionMovementDelta(actions: ReadonlySet<MovementAction>, camera: THREE.Camera, horizontalSpeed: number, verticalSpeed: number, deltaSeconds: number): THREE.Vector3 {
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
export function blockCoordinateFromHit(hit: THREE.Intersection): VoxelCoordinate | undefined {
  const direct = hit.object.userData['voxel'] as VoxelCoordinate | undefined;
  if (direct) return direct;
  const instanceId = hit.instanceId;
  if (instanceId === undefined) return undefined;
  return (hit.object.userData['instanceVoxels'] as VoxelCoordinate[] | undefined)?.[instanceId];
}
function cloneInstanceTemplates(templates: readonly InstancePartTemplate[]): readonly InstancePartTemplate[] {
  return templates.map((template) => ({ geometry: template.geometry, material: template.material.clone(), matrix: template.matrix.clone() }));
}
function instanceTemplateEnvelope(templates: readonly InstancePartTemplate[]): THREE.Box3 {
  const envelope = new THREE.Box3();
  for (const template of templates) {
    template.geometry.computeBoundingBox();
    if (template.geometry.boundingBox) envelope.union(template.geometry.boundingBox.clone().applyMatrix4(template.matrix));
  }
  return envelope.isEmpty() ? unitVoxelEnvelope() : envelope;
}
function unitVoxelEnvelope(): THREE.Box3 { return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)); }
function stableChunkBounds(chunk: string, envelope: THREE.Box3): THREE.Box3 {
  const [chunkX, chunkY, chunkZ] = chunk.split(',').map(Number);
  const origin = new THREE.Vector3(chunkX * VIEWPORT_INSTANCE_CHUNK_SIZE, chunkY * VIEWPORT_INSTANCE_CHUNK_SIZE, chunkZ * VIEWPORT_INSTANCE_CHUNK_SIZE);
  return new THREE.Box3(
    origin.clone().add(envelope.min),
    origin.clone().add(new THREE.Vector3(VIEWPORT_INSTANCE_CHUNK_SIZE - 1, VIEWPORT_INSTANCE_CHUNK_SIZE - 1, VIEWPORT_INSTANCE_CHUNK_SIZE - 1)).add(envelope.max),
  );
}
function setStableMeshBounds(mesh: THREE.InstancedMesh, bounds: THREE.Box3): void {
  mesh.boundingBox = bounds.clone();
  mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
}
function chunkKey(position: VoxelCoordinate): string { return `${Math.floor(position.x / VIEWPORT_INSTANCE_CHUNK_SIZE)},${Math.floor(position.y / VIEWPORT_INSTANCE_CHUNK_SIZE)},${Math.floor(position.z / VIEWPORT_INSTANCE_CHUNK_SIZE)}`; }
function disposeObject(object: THREE.Object3D): void { (object.userData['ownedDecorationTextureCache'] as { dispose?: () => void } | undefined)?.dispose?.(); object.traverse((child) => { if (child instanceof THREE.Mesh) { if (!child.geometry.userData['providerOwnedGeometry'] && !child.geometry.userData['sharedFallbackGeometry'] && !child.geometry.userData['sharedPlaceholderGeometry']) child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const material of materials) { if (material.userData['sharedFallbackMaterial'] || material.userData['sharedPlaceholderMaterial']) continue; if (material.map?.userData['ownedBedAtlasTexture'] || material.map?.userData['ownedSignTexture']) material.map.dispose(); material.dispose(); } } }); }

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
