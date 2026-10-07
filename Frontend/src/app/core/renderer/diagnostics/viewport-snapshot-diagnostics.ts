import type { ViewportGhostSceneSnapshot, ViewportInstanceOwnershipEvent, ViewportOwnershipDiagnostics } from './viewport-diagnostics-contracts';

export function captureViewportGhostSceneSnapshot(diagnostics: ViewportOwnershipDiagnostics, activeBlock: { readonly id: string; readonly state: Readonly<Record<string, string>> } | undefined, instanceOwnershipTrace: readonly ViewportInstanceOwnershipEvent[]): ViewportGhostSceneSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    authoritativeProjectBlockCount: diagnostics.authoritativeProjectBlockCount,
    ...(activeBlock ? { activeBlock } : {}),
    ownership: {
      authoritativeVisibleBlockCount: diagnostics.authoritativeVisibleBlockCount,
      renderedBlockCount: diagnostics.renderedBlockCount,
      placeholderVisualCount: diagnostics.placeholderVisualCount,
      placeholderBatchCount: diagnostics.placeholderBatchCount,
      placeholderIndexCount: diagnostics.placeholderIndexCount,
      instanceBatchCount: diagnostics.instanceBatchCount,
      instanceMemberCount: diagnostics.instanceMemberCount,
      blocksGroupChildCount: diagnostics.blocksGroupChildCount,
      visibleMeshCount: diagnostics.visibleMeshCount,
      visibleMeshesOutsideBlocksGroup: diagnostics.visibleMeshesOutsideBlocksGroup,
      hydrationState: { ...diagnostics.hydrationState },
    },
    visibleMeshes: [...diagnostics.visibleMeshSample],
    suspiciousVisualCount: diagnostics.suspiciousVisualCount,
    suspiciousVisuals: [...diagnostics.suspiciousVisuals],
    directSceneChildren: diagnostics.directSceneChildren.map((child) => ({ ...child })),
    instanceOwnershipTrace: instanceOwnershipTrace.map((event) => ({ ...event, physicalMemberships: event.physicalMemberships.map((membership) => ({ ...membership })), violations: [...event.violations], ...(event.previousEntry ? { previousEntry: { ...event.previousEntry } } : {}) })),
    previewState: { ...diagnostics.previewState },
  };
}
