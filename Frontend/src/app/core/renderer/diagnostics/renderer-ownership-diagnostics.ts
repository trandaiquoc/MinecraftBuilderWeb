import * as THREE from 'three';
import { coordinateKey } from '../../domain/coordinates';
import type { VoxelCoordinate } from '../../domain/project.types';
import { collectInstanceOwnershipViolations } from './instance-ownership-diagnostics';
import type { InstanceOwnershipBatchView } from './instance-ownership-diagnostics';
import type {
  ViewportOwnershipDiagnostics,
  ViewportSuspiciousVisualDiagnostic,
  ViewportVisibleMeshDiagnostic,
} from './viewport-diagnostics-contracts';

interface RenderedEntryView {
  readonly fallback?: THREE.Object3D;
  readonly instanceBatchKey?: string;
  readonly instanceIndex?: number;
}

interface PlaceholderBatchView {
  readonly key: string;
  readonly keys: readonly string[];
  readonly positions: readonly VoxelCoordinate[];
  readonly mesh: THREE.InstancedMesh;
}

export interface RendererOwnershipDiagnosticSnapshot {
  readonly scene: THREE.Scene;
  readonly canonicalRoot: THREE.Object3D;
  readonly roots: readonly { readonly object?: THREE.Object3D; readonly name: string }[];
  readonly projectBlockCount: number;
  readonly expectedKeys: ReadonlySet<string>;
  readonly renderedEntries: ReadonlyMap<string, RenderedEntryView>;
  readonly placeholderIndices: ReadonlyMap<string, unknown>;
  readonly pendingSignatures: ReadonlyMap<string, unknown>;
  readonly placeholderSignatures: ReadonlyMap<string, unknown>;
  readonly queuedKeys: readonly string[];
  readonly runningKeys: ReadonlyMap<string, number>;
  readonly instanceBatches: Iterable<InstanceOwnershipBatchView>;
  readonly instanceOwnershipIndex: ReadonlyMap<
    string,
    { readonly batchKey: string; readonly index: number }
  >;
  readonly placeholderBatches: Iterable<PlaceholderBatchView>;
  readonly runtimeChecks: boolean;
  readonly preview: ViewportOwnershipDiagnostics['previewState'];
  readonly previewActivity: {
    readonly activeBlock: boolean;
    readonly groupMoveActive: boolean;
    readonly decorationActive: boolean;
  };
  readonly hydration: ViewportOwnershipDiagnostics['hydrationState'];
}

/** Expensive, explicit scene inspection. This is called only by diagnostics APIs. */
export function collectRendererOwnershipDiagnostics(
  snapshot: RendererOwnershipDiagnosticSnapshot,
): ViewportOwnershipDiagnostics {
  const expectedKeys = snapshot.expectedKeys;
  const staleKeys = new Set<string>();
  const addStale = (key: string): void => {
    if (!expectedKeys.has(key)) staleKeys.add(key);
  };
  for (const key of snapshot.renderedEntries.keys()) addStale(key);
  for (const key of snapshot.placeholderIndices.keys()) addStale(key);
  for (const key of snapshot.pendingSignatures.keys()) addStale(key);
  for (const key of snapshot.placeholderSignatures.keys()) addStale(key);
  for (const key of snapshot.queuedKeys) addStale(key);
  for (const key of snapshot.runningKeys.keys()) addStale(key);

  const instanceBatches = [...snapshot.instanceBatches];
  const placeholderBatches = [...snapshot.placeholderBatches];
  const batchInvariantViolations = [
    ...collectInstanceOwnershipViolations({
      batches: instanceBatches,
      ownershipIndex: snapshot.instanceOwnershipIndex,
      renderedEntries: snapshot.renderedEntries,
      runtimeChecks: snapshot.runtimeChecks,
    }),
  ];
  let instanceMemberCount = 0;
  for (const batch of instanceBatches) {
    instanceMemberCount += batch.keys.length;
    for (const key of batch.keys) addStale(key);
    for (const part of batch.parts) {
      const voxels = part.userData['instanceVoxels'];
      if (Array.isArray(voxels))
        for (const voxel of voxels) {
          if (
            voxel &&
            typeof voxel === 'object' &&
            typeof (voxel as VoxelCoordinate).x === 'number'
          )
            addStale(coordinateKey(voxel as VoxelCoordinate));
        }
    }
  }

  let placeholderVisualCount = 0;
  for (const batch of placeholderBatches) {
    placeholderVisualCount += batch.keys.length;
    if (batch.keys.length !== batch.positions.length || batch.mesh.count !== batch.keys.length)
      batchInvariantViolations.push(`${batch.key}: placeholder length/count mismatch`);
    for (const key of batch.keys) addStale(key);
  }

  const outsideBlocksGroupOwners: string[] = [];
  const outsideMeshSample: ViewportVisibleMeshDiagnostic[] = [];
  const insideMeshSample: ViewportVisibleMeshDiagnostic[] = [];
  const suspiciousVisuals: ViewportSuspiciousVisualDiagnostic[] = [];
  let suspiciousVisualCount = 0;
  let visibleMeshCount = 0;
  const isVisibleInScene = (object: THREE.Object3D): boolean => {
    for (let current: THREE.Object3D | null = object; current; current = current.parent)
      if (!current.visible) return false;
    return true;
  };
  const voxelFromObject = (object: THREE.Object3D): string | undefined => {
    const voxel = object.userData['voxel'] as VoxelCoordinate | undefined;
    return voxel &&
      typeof voxel.x === 'number' &&
      typeof voxel.y === 'number' &&
      typeof voxel.z === 'number'
      ? coordinateKey(voxel)
      : undefined;
  };
  const root = (object: THREE.Object3D): THREE.Object3D => {
    let current = object;
    while (
      current.parent &&
      current.parent !== snapshot.scene &&
      current.parent !== snapshot.canonicalRoot
    )
      current = current.parent;
    return current;
  };
  const isDescendantOf = (
    object: THREE.Object3D,
    ancestor: THREE.Object3D | undefined,
  ): boolean => {
    for (let current: THREE.Object3D | null = object; current; current = current.parent)
      if (current === ancestor) return true;
    return false;
  };
  const ownerOf = (object: THREE.Object3D): string => {
    const objectRoot = root(object);
    const namedRoot = snapshot.roots.find((candidate) => candidate.object === objectRoot)?.name;
    if (
      objectRoot === snapshot.roots.find((candidate) => candidate.name === 'blocksGroup')?.object
    ) {
      if (object instanceof THREE.InstancedMesh && object.userData['placeholder'] === true)
        return 'placeholderBatches';
      if (
        object instanceof THREE.InstancedMesh &&
        object.userData['instanceBatchKey'] !== undefined
      )
        return 'instanceBatches';
      const key = voxelFromObject(object);
      if (key && snapshot.renderedEntries.get(key)?.fallback === object) return 'fallback mesh';
    }
    return namedRoot ?? (objectRoot.name || objectRoot.type);
  };
  const diagnosticValue = (value: unknown): unknown => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return value;
    if (Array.isArray(value)) return value.slice(0, 8).map(diagnosticValue);
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (
        typeof record['x'] === 'number' &&
        typeof record['y'] === 'number' &&
        typeof record['z'] === 'number'
      )
        return { x: record['x'], y: record['y'], z: record['z'] };
      if (typeof record['id'] === 'string')
        return { id: record['id'], state: diagnosticValue(record['state']) };
      return `[${(value as object).constructor?.name ?? 'Object'}]`;
    }
    return String(value);
  };
  const materialDiagnostics = (
    material: THREE.Material,
  ): ViewportVisibleMeshDiagnostic['materials'][number] => {
    const textured = material as THREE.Material & {
      readonly map?: THREE.Texture;
      readonly opacity?: number;
    };
    const texture = textured.map;
    const textureImage = texture?.image as
      { readonly src?: string; readonly currentSrc?: string; readonly name?: string } | undefined;
    return {
      uuid: material.uuid,
      type: material.type,
      visible: material.visible,
      opacity: textured.opacity ?? 1,
      ...(texture
        ? {
            texture: {
              uuid: texture.uuid,
              sourceUuid: texture.source.uuid,
              ...(textureImage?.currentSrc || textureImage?.src || textureImage?.name
                ? {
                    sourceIdentity:
                      textureImage.currentSrc || textureImage.src || textureImage.name,
                  }
                : {}),
            },
          }
        : {}),
    };
  };
  const directSceneChildren = snapshot.scene.children.map((child) => ({
    owner: ownerOf(child),
    uuid: child.uuid,
    visible: child.visible,
    childCount: child.children.length,
  }));
  snapshot.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isVisibleInScene(object)) return;
    const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(
      materialDiagnostics,
    );
    if (materials.every((material) => !material.visible || material.opacity <= 0)) return;
    if (object instanceof THREE.InstancedMesh && object.count === 0) return;
    visibleMeshCount += 1;
    const owner = ownerOf(object);
    const ownedByBlocksGroup = isDescendantOf(
      object,
      snapshot.roots.find((candidate) => candidate.name === 'blocksGroup')?.object,
    );
    const isIsolationPresentationMesh = owner === 'groupIsolationPresentation';
    if (!ownedByBlocksGroup && !isIsolationPresentationMesh) {
      outsideBlocksGroupOwners.push(`${owner}/${object.type}:${object.uuid}`);
      const key = voxelFromObject(object);
      if (key) addStale(key);
    }
    if (snapshot.projectBlockCount === 0) {
      const preview = snapshot.preview;
      const intentionalPreview =
        ((owner === 'ghostModel' || owner === 'ghost') &&
          preview.ghostVisible &&
          !!preview.ghostTarget &&
          snapshot.previewActivity.activeBlock) ||
        (owner === 'movePreviewGroup' && snapshot.previewActivity.groupMoveActive) ||
        (owner === 'decorationGhostGroup' && snapshot.previewActivity.decorationActive);
      const knownBlockOwner =
        owner === 'blocksGroup' ||
        owner === 'instanceBatches' ||
        owner === 'placeholderBatches' ||
        owner === 'fallback mesh';
      const knownNonBlockOwner = [
        'decorationsGroup',
        'decorationSelectionGroup',
        'structureBlockGuide',
        'projectGrid',
        'ground',
        'editingPlane',
        'boundsBox',
        'selectionOutline',
        'selectionBox',
        'logicalSelectionGroup',
      ].includes(owner);
      let reason: string | undefined;
      if (knownBlockOwner) reason = 'Block-renderer mesh remains while the project has zero blocks';
      else if ((owner === 'ghostModel' || owner === 'ghost') && !intentionalPreview)
        reason = 'Visible placement ghost has no active placement target';
      else if (owner === 'movePreviewGroup' && !intentionalPreview)
        reason = 'Group-move preview mesh remains without an active move preview';
      else if (owner === 'decorationGhostGroup' && !intentionalPreview)
        reason = 'Decoration preview mesh remains without an active decoration';
      else if (!knownNonBlockOwner && !intentionalPreview)
        reason = 'Visible mesh remains under a non-authoritative scene owner';
      if (reason) {
        suspiciousVisualCount += 1;
        if (suspiciousVisuals.length < 24) {
          object.updateWorldMatrix(true, false);
          const bounds = new THREE.Box3().setFromObject(object);
          suspiciousVisuals.push({
            owner,
            uuid: object.uuid,
            reason,
            intentionalPreview: false,
            position: vectorValue(object.getWorldPosition(new THREE.Vector3())),
            worldBounds: { min: vectorValue(bounds.min), max: vectorValue(bounds.max) },
          });
        }
      }
    }
    const sample = ownedByBlocksGroup ? insideMeshSample : outsideMeshSample;
    if (sample.length >= 24) return;
    object.updateWorldMatrix(true, false);
    const parentPath: ViewportVisibleMeshDiagnostic['parentPath'][number][] = [];
    for (let current: THREE.Object3D | null = object; current; current = current.parent) {
      parentPath.push({
        type: current.type,
        name: current.name,
        uuid: current.uuid,
        visible: current.visible,
      });
      if (current === snapshot.scene) break;
    }
    const directSceneRoot = ownerOf(root(object));
    const worldPosition = object.getWorldPosition(new THREE.Vector3());
    if (object instanceof THREE.InstancedMesh) object.computeBoundingBox();
    const worldBounds = new THREE.Box3().setFromObject(object);
    const instanceData =
      object instanceof THREE.InstancedMesh
        ? {
            count: object.count,
            ...(typeof object.userData['instanceBatchKey'] === 'string'
              ? { batchKey: object.userData['instanceBatchKey'] as string }
              : {}),
            instanceKeys: Array.isArray(object.userData['instanceKeys'])
              ? (object.userData['instanceKeys'] as unknown[]).slice(0, 6).map(String)
              : [],
            instanceVoxels: Array.isArray(object.userData['instanceVoxels'])
              ? (object.userData['instanceVoxels'] as unknown[]).slice(0, 6).flatMap((value) =>
                  value &&
                  typeof value === 'object' &&
                  typeof (value as VoxelCoordinate).x === 'number'
                    ? [
                        {
                          x: (value as VoxelCoordinate).x,
                          y: (value as VoxelCoordinate).y,
                          z: (value as VoxelCoordinate).z,
                        },
                      ]
                    : [],
                )
              : [],
            worldPositions: Array.from({ length: Math.min(object.count, 6) }, (_, index) => {
              const instanceMatrix = new THREE.Matrix4();
              object.getMatrixAt(index, instanceMatrix);
              return vectorValue(
                new THREE.Vector3()
                  .setFromMatrixPosition(instanceMatrix)
                  .applyMatrix4(object.matrixWorld),
              );
            }),
          }
        : undefined;
    const rootObject = (name: string) =>
      snapshot.roots.find((candidate) => candidate.name === name)?.object;
    sample.push({
      owner,
      directSceneRoot,
      objectType: object.type,
      uuid: object.uuid,
      visible: object.visible,
      parentPath: parentPath.reverse(),
      localPosition: vectorValue(object.position),
      worldPosition: vectorValue(worldPosition),
      worldBounds: { min: vectorValue(worldBounds.min), max: vectorValue(worldBounds.max) },
      matrixWorld: object.matrixWorld.toArray(),
      renderOrder: object.renderOrder,
      descendantsOf: {
        blocksGroup: isDescendantOf(object, rootObject('blocksGroup')),
        ghostModel: isDescendantOf(object, rootObject('ghostModel')),
        ghost: isDescendantOf(object, rootObject('ghost')),
        movePreviewGroup: isDescendantOf(object, rootObject('movePreviewGroup')),
        decorationGhostGroup: isDescendantOf(object, rootObject('decorationGhostGroup')),
        decorationSelectionGroup: isDescendantOf(object, rootObject('decorationSelectionGroup')),
        logicalSelectionGroup: isDescendantOf(object, rootObject('logicalSelectionGroup')),
      },
      geometry: { uuid: object.geometry.uuid, type: object.geometry.type },
      materials,
      userData: Object.fromEntries(
        Object.entries(object.userData).map(([key, value]) => [key, diagnosticValue(value)]),
      ),
      ...(object instanceof THREE.InstancedMesh
        ? { instanceCount: object.count, instances: instanceData }
        : {}),
    });
  });

  return {
    authoritativeVisibleBlockCount: expectedKeys.size,
    authoritativeProjectBlockCount: snapshot.projectBlockCount,
    renderedBlockCount: snapshot.renderedEntries.size,
    placeholderVisualCount,
    instanceBatchCount: instanceBatches.length,
    instanceMemberCount,
    placeholderBatchCount: placeholderBatches.length,
    placeholderIndexCount: snapshot.placeholderIndices.size,
    blocksGroupChildCount:
      snapshot.roots.find((candidate) => candidate.name === 'blocksGroup')?.object?.children
        .length ?? 0,
    blockLikeSceneObjectsOutsideBlocksGroup: outsideBlocksGroupOwners.length,
    visibleMeshesOutsideBlocksGroup: outsideBlocksGroupOwners.length,
    staleVoxelKeys: [...staleKeys].sort(),
    batchInvariantViolations,
    outsideBlocksGroupOwners,
    visibleMeshCount,
    visibleMeshSample: [...outsideMeshSample, ...insideMeshSample].slice(0, 32),
    visibleMeshesOutsideBlocksGroupSample: outsideMeshSample,
    suspiciousVisualCount,
    suspiciousVisuals,
    directSceneChildren,
    previewState: snapshot.preview,
    hydrationState: snapshot.hydration,
  };
}

function vectorValue(vector: THREE.Vector3): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return { x: vector.x, y: vector.y, z: vector.z };
}
