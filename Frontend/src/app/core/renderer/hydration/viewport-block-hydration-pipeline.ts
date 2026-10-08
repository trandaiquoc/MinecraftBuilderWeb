import { HydrationProgressTracker } from '../scheduling/hydration-progress-tracker';
import type { HydrationLane, HydrationProgressSnapshot } from '../scheduling/hydration-progress-tracker';
import { HydrationScheduler } from '../scheduling/hydration-scheduler';
import { HydrationWorkCoordinator } from '../scheduling/hydration-work-coordinator';
import type { HydrationWorkItem } from '../scheduling/hydration-work-coordinator';

export interface RunningBlockHydrationOwnership {
  readonly generation: number;
  readonly revision: number;
  readonly signature: string;
}

/** Owns block hydration workflow state while composing the established queue and progress owners. */
export class ViewportBlockHydrationPipeline<T extends HydrationWorkItem> {
  readonly work: HydrationWorkCoordinator<T>;
  readonly progress: HydrationProgressTracker;
  readonly scheduler = new HydrationScheduler<never>();
  private currentGeneration = 0;
  private readonly pending = new Map<string, string>();
  private readonly running = new Map<string, RunningBlockHydrationOwnership>();
  private readonly runningByGeneration = new Map<number, number>();
  private batchJobBudget = 0;
  private batchDeadline = 0;
  private currentLane: HydrationLane = 'structural';

  constructor(options: {
    readonly concurrency: number;
    readonly regularReservedCapacity: number;
    readonly providerRefreshCapacity: number;
    readonly onProgressRegression?: () => void;
    readonly onProgress?: (snapshot: HydrationProgressSnapshot) => void;
  }) {
    this.work = new HydrationWorkCoordinator<T>(options);
    this.progress = new HydrationProgressTracker(options.onProgressRegression, options.onProgress);
  }

  get generation(): number { return this.currentGeneration; }
  get lane(): HydrationLane { return this.currentLane; }
  get runningTotal(): number { return this.work.runningTotal(); }
  get pendingCount(): number { return this.pending.size; }
  get runningCount(): number { return this.running.size; }
  get batchBudget(): number { return this.batchJobBudget; }
  get batchDeadlineAt(): number { return this.batchDeadline; }

  advanceGeneration(): number { this.currentGeneration += 1; return this.currentGeneration; }
  setLane(lane: HydrationLane): void { this.currentLane = lane; }

  pendingSignature(key: string): string | undefined { return this.pending.get(key); }
  hasPendingSignature(key: string): boolean { return this.pending.has(key); }
  pendingKeys(): IterableIterator<string> { return this.pending.keys(); }
  pendingSnapshot(): ReadonlyMap<string, string> { return new Map(this.pending); }
  setPendingSignature(key: string, signature: string): void { this.pending.set(key, signature); }
  clearPendingSignature(key: string): void { this.pending.delete(key); }
  clearPendingSignatures(): void { this.pending.clear(); }

  runningOwnership(key: string): RunningBlockHydrationOwnership | undefined { return this.running.get(key); }
  hasRunningOwnership(key: string): boolean { return this.running.has(key); }
  runningGenerationFor(key: string): number | undefined { return this.running.get(key)?.generation; }
  runningKeys(): IterableIterator<string> { return this.running.keys(); }
  runningSnapshot(): ReadonlyMap<string, RunningBlockHydrationOwnership> { return new Map(this.running); }
  runningGenerationCount(generation: number): number { return this.runningByGeneration.get(generation) ?? 0; }
  runningGenerationSnapshot(): ReadonlyMap<number, number> { return this.runningByGeneration; }
  runningKeyGenerationsSnapshot(): ReadonlyMap<string, number> { return new Map([...this.running].map(([key, owner]) => [key, owner.generation])); }

  startWork(generation: number): void {
    this.runningByGeneration.set(generation, this.runningGenerationCount(generation) + 1);
  }

  startJob(key: string, generation: number, revision: number, signature: string): void {
    this.running.set(key, { generation, revision, signature });
  }

  ownsJob(key: string, generation: number, revision: number, signature: string): boolean {
    const owner = this.running.get(key);
    return owner?.generation === generation && owner.revision === revision && owner.signature === signature;
  }

  finishWork(generation: number): void {
    const count = Math.max(0, this.runningGenerationCount(generation) - 1);
    if (count) this.runningByGeneration.set(generation, count);
    else this.runningByGeneration.delete(generation);
  }

  finishJobOwnership(key: string): void { this.running.delete(key); }

  clearRunningOwnership(): void { this.running.clear(); this.runningByGeneration.clear(); }

  setBatchBudget(jobCount: number, deadline: number): void { this.batchJobBudget = jobCount; this.batchDeadline = deadline; }
  consumeBatchJob(): void { this.batchJobBudget = Math.max(0, this.batchJobBudget - 1); }
  clearBatchBudget(): void { this.setBatchBudget(0, 0); }

}
