import { stableValueKey } from '../../domain/stable-value-key';

type EmptyTransitionMesh = {
  readonly owner: string;
  readonly uuid: string;
  readonly worldPosition: unknown;
  readonly worldBounds: unknown;
};
type EmptyTransitionVisual = {
  readonly owner: string;
  readonly uuid: string;
  readonly position: unknown;
  readonly worldBounds: unknown;
};
type EmptyTransitionSnapshot<
  TMesh extends EmptyTransitionMesh,
  TVisual extends EmptyTransitionVisual,
> = {
  readonly ownership: { readonly visibleMeshCount: number; readonly renderedBlockCount: number };
  readonly visibleMeshes: readonly TMesh[];
  readonly suspiciousVisuals: readonly TVisual[];
  readonly previewState: unknown;
  readonly activeBlock?: unknown;
};

export function compareEmptySnapshots<
  TMesh extends EmptyTransitionMesh,
  TVisual extends EmptyTransitionVisual,
>(
  firstEmpty: EmptyTransitionSnapshot<TMesh, TVisual>,
  secondEmpty: EmptyTransitionSnapshot<TMesh, TVisual>,
) {
  const visualKey = (visual: TVisual): string =>
    `${visual.owner}|${visual.uuid}|${stableValueKey(visual.position)}|${stableValueKey(visual.worldBounds)}`;
  const meshKey = (mesh: TMesh): string =>
    `${mesh.owner}|${mesh.uuid}|${stableValueKey(mesh.worldPosition)}|${stableValueKey(mesh.worldBounds)}`;
  const firstMeshes = new Map(firstEmpty.visibleMeshes.map((mesh) => [meshKey(mesh), mesh]));
  const secondMeshes = new Map(secondEmpty.visibleMeshes.map((mesh) => [meshKey(mesh), mesh]));
  const firstVisuals = new Map(
    firstEmpty.suspiciousVisuals.map((visual) => [visualKey(visual), visual]),
  );
  const secondVisuals = new Map(
    secondEmpty.suspiciousVisuals.map((visual) => [visualKey(visual), visual]),
  );
  return {
    visibleMeshCountDelta:
      secondEmpty.ownership.visibleMeshCount - firstEmpty.ownership.visibleMeshCount,
    renderedBlockCountDelta:
      secondEmpty.ownership.renderedBlockCount - firstEmpty.ownership.renderedBlockCount,
    visibleMeshesAdded: [...secondMeshes]
      .filter(([key]) => !firstMeshes.has(key))
      .map(([, mesh]) => mesh),
    visibleMeshesRemoved: [...firstMeshes]
      .filter(([key]) => !secondMeshes.has(key))
      .map(([, mesh]) => mesh),
    suspiciousVisualsAdded: [...secondVisuals]
      .filter(([key]) => !firstVisuals.has(key))
      .map(([, visual]) => visual),
    suspiciousVisualsRemoved: [...firstVisuals]
      .filter(([key]) => !secondVisuals.has(key))
      .map(([, visual]) => visual),
    previewStateChanged:
      stableValueKey({
        previewState: firstEmpty.previewState,
        activeBlock: firstEmpty.activeBlock,
      }) !==
      stableValueKey({
        previewState: secondEmpty.previewState,
        activeBlock: secondEmpty.activeBlock,
      }),
  };
}
