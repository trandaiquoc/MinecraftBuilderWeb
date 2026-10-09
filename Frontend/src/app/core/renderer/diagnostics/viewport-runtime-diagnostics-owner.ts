import type { ViewportGhostSceneSnapshot, ViewportInstanceOwnershipEvent } from './viewport-diagnostics-contracts';

/** Owns mutable diagnostic history and its bounded lifecycle. */
export class ViewportRuntimeDiagnosticsOwner {
  private enabledValue = false;
  private observedProjectBlockCountValue = 0;
  private readonly emptyTransitionSnapshotsValue: ViewportGhostSceneSnapshot[] = [];
  private readonly instanceOwnershipTraceValue: ViewportInstanceOwnershipEvent[] = [];

  get enabled(): boolean { return this.enabledValue; }
  get observedProjectBlockCount(): number { return this.observedProjectBlockCountValue; }
  get emptyTransitionSnapshots(): readonly ViewportGhostSceneSnapshot[] { return this.emptyTransitionSnapshotsValue; }
  get instanceOwnershipTrace(): readonly ViewportInstanceOwnershipEvent[] { return this.instanceOwnershipTraceValue; }

  setEnabled(enabled: boolean, projectBlockCount: number): void {
    this.enabledValue = enabled;
    this.observedProjectBlockCountValue = projectBlockCount;
    this.clearHistory();
  }

  observeProjectBlockCount(projectBlockCount: number, captureEmptyTransition: () => ViewportGhostSceneSnapshot): void {
    if (this.enabledValue && this.observedProjectBlockCountValue > 0 && projectBlockCount === 0) {
      this.emptyTransitionSnapshotsValue.push(captureEmptyTransition());
      if (this.emptyTransitionSnapshotsValue.length > 2) this.emptyTransitionSnapshotsValue.shift();
    }
    this.observedProjectBlockCountValue = projectBlockCount;
  }

  recordInstanceOwnership(event: ViewportInstanceOwnershipEvent): void {
    if (!this.enabledValue) return;
    this.instanceOwnershipTraceValue.push(event);
    if (this.instanceOwnershipTraceValue.length > 256) this.instanceOwnershipTraceValue.shift();
  }

  clearHistory(): void {
    this.emptyTransitionSnapshotsValue.length = 0;
    this.instanceOwnershipTraceValue.length = 0;
  }
}
