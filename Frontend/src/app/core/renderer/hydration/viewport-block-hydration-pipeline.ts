import { HydrationProgressTracker } from '../scheduling/hydration-progress-tracker';
import type { HydrationBlockScopeDelta, HydrationLane, HydrationProgressSnapshot } from '../scheduling/hydration-progress-tracker';
import { BlockHydrationWorkOwner } from './block-hydration-work-owner';
import type { HydrationExecutionPort, RunningBlockHydrationOwnership } from './block-hydration-work-owner';
import type { HydrationWorkCounts, HydrationWorkItem } from '../scheduling/hydration-work-coordinator';

export type { HydrationExecutionPort, RunningBlockHydrationOwnership } from './block-hydration-work-owner';

/** Composes block work ownership with viewport-wide progress publication. */
export class ViewportBlockHydrationPipeline<T extends HydrationWorkItem> {
  private readonly work: BlockHydrationWorkOwner<T>;
  private readonly progress: HydrationProgressTracker;

  constructor(options: {
    readonly concurrency: number;
    readonly regularReservedCapacity: number;
    readonly providerRefreshCapacity: number;
    readonly onProgressRegression?: () => void;
    readonly onProgress?: (snapshot: HydrationProgressSnapshot) => void;
  }) {
    this.work = new BlockHydrationWorkOwner<T>(options);
    this.progress = new HydrationProgressTracker(options.onProgressRegression, options.onProgress);
  }

  get generation(): number { return this.work.generation; }
  get lane(): HydrationLane { return this.work.lane; }
  get runningTotal(): number { return this.work.runningTotal; }
  get pendingCount(): number { return this.work.pendingCount; }
  get runningCount(): number { return this.work.runningCount; }
  get batchBudget(): number { return this.work.batchBudget; }
  get batchDeadlineAt(): number { return this.work.batchDeadlineAt; }

  advanceGeneration(): number { return this.work.advanceGeneration(); }
  setLane(lane: HydrationLane): void { this.work.setLane(lane); }
  pendingSignature(key: string): string | undefined { return this.work.pendingSignature(key); }
  hasPendingSignature(key: string): boolean { return this.work.hasPendingSignature(key); }
  pendingKeys(): IterableIterator<string> { return this.work.pendingKeys(); }
  pendingSnapshot(): ReadonlyMap<string, string> { return this.work.pendingSnapshot(); }
  setPendingSignature(key: string, signature: string): void { this.work.setPendingSignature(key, signature); }
  clearPendingSignature(key: string): void { this.work.clearPendingSignature(key); }
  clearPendingSignatures(): void { this.work.clearPendingSignatures(); }
  runningOwnership(key: string): RunningBlockHydrationOwnership | undefined { return this.work.runningOwnership(key); }
  hasRunningOwnership(key: string): boolean { return this.work.hasRunningOwnership(key); }
  runningGenerationFor(key: string): number | undefined { return this.work.runningGenerationFor(key); }
  runningKeys(): IterableIterator<string> { return this.work.runningKeys(); }
  runningSnapshot(): ReadonlyMap<string, RunningBlockHydrationOwnership> { return this.work.runningSnapshot(); }
  runningGenerationCount(generation: number): number { return this.work.runningGenerationCount(generation); }
  runningGenerationSnapshot(): ReadonlyMap<number, number> { return this.work.runningGenerationSnapshot(); }
  runningKeyGenerationsSnapshot(): ReadonlyMap<string, number> { return this.work.runningKeyGenerationsSnapshot(); }
  workCounts(): HydrationWorkCounts { return this.work.workCounts(); }
  regularJobs(): readonly T[] { return this.work.regularJobs(); }
  prioritizeRegularJobs(roleOf: (job: T) => 'normal' | 'reference' | 'missing'): void { this.work.prioritizeRegularJobs(roleOf); }
  takeNextJob(generation: number): T | undefined { return this.work.takeNextJob(generation); }
  completeJob(job: T): void { this.work.completeJob(job); }
  fairnessDeferrals(): number { return this.work.fairnessDeferrals(); }
  canStartWork(): boolean { return this.work.canStartWork(); }
  enqueueRegular(job: T): void { this.work.enqueueRegular(job); }
  enqueueProviderRefresh(job: T): boolean { return this.work.enqueueProviderRefresh(job); }
  replaceRegular(jobs: readonly T[]): void { this.work.replaceRegular(jobs); }
  retainPending(predicate: (job: T) => boolean): void { this.work.retainPending(predicate); }
  removePendingKeys(keys: ReadonlySet<string>): void { this.work.removePendingKeys(keys); }
  clearPendingWork(): void { this.work.clearPendingWork(); }
  clearPendingProviderRefreshWork(): void { this.work.clearPendingProviderRefreshWork(); }
  compactWork(): void { this.work.compactWork(); }
  compactConsumedWork(): void { this.work.compactConsumedWork(); }
  queuedWork(): number { return this.work.queuedWork(); }
  queuedProviderRefreshWork(): number { return this.work.queuedProviderRefreshWork(); }
  isScheduled(): boolean { return this.work.isScheduled(); }
  isTimerActive(): boolean { return this.work.isTimerActive(); }
  cancelScheduledWork(): void { this.work.cancelScheduledWork(); }

  progressSnapshot(): HydrationProgressSnapshot { return this.progress.snapshot(); }
  onProgress(listener: (progress: HydrationProgressSnapshot) => void): () => void { return this.progress.onProgress(listener); }
  setBlockScope(keys: readonly string[]): void { this.progress.setBlockScope(keys); }
  applyBlockScopeDelta(delta: HydrationBlockScopeDelta, publish = true): void { this.progress.applyBlockScopeDelta(delta, publish); }
  addBlockKey(key: string): void { this.progress.addBlockKey(key); }
  removeBlockKey(key: string): void { this.progress.removeBlockKey(key); }
  hasBlockKey(key: string): boolean { return this.progress.hasBlockKey(key); }
  invalidateBlock(key: string): void { this.progress.invalidate('block', key); }
  syncMissingBlockState(key: string, state: 'resolved' | 'provisional' | 'permanent' | 'pending'): void { this.progress.syncMissingBlockState(key, state); }
  missingStateKeys(): readonly string[] { return this.progress.missingStateKeys(); }
  adoptBlockKeys(generation: number, keys: readonly string[]): void { this.progress.adoptBlockKeys(generation, keys); }
  setDecorationScope(ids: readonly string[]): void { this.progress.setDecorationScope(ids); }
  adoptDecorationIds(generation: number, ids: readonly string[]): void { this.progress.adoptDecorationIds(generation, ids); }
  setProgressLane(lane: HydrationLane): void { this.progress.setLane(lane); }
  refreshProgress(): void { this.progress.refresh(); }
  beginProgress(generation: number, lane?: HydrationLane): void { this.progress.begin(generation, lane); }
  completeProgress(generation: number, kind: 'block' | 'decoration', key: string): void { this.progress.complete(generation, kind, key); }
  completeProgressBatch(generation: number, kind: 'block' | 'decoration', keys: readonly string[]): void { this.progress.completeBatch(generation, kind, keys); }
  publishProgress(progress: HydrationProgressSnapshot): void { this.progress.publish(progress); }
  resetProgress(): void { this.progress.reset(this.generation); }
  clearProgress(): void { this.progress.clear(); }

  startWork(generation: number): void { this.work.startWork(generation); }
  startJob(key: string, generation: number, revision: number, signature: string): void { this.work.startJob(key, generation, revision, signature); }
  ownsJob(key: string, generation: number, revision: number, signature: string): boolean { return this.work.ownsJob(key, generation, revision, signature); }
  finishWork(generation: number): void { this.work.finishWork(generation); }
  finishJobOwnership(key: string): void { this.work.finishJobOwnership(key); }
  clearRunningOwnership(): void { this.work.clearRunningOwnership(); }
  setBatchBudget(jobCount: number, deadline: number): void { this.work.setBatchBudget(jobCount, deadline); }
  consumeBatchJob(): void { this.work.consumeBatchJob(); }
  clearBatchBudget(): void { this.work.clearBatchBudget(); }
  schedule(run: () => void, delay: boolean | number = false): void { this.work.schedule(run, delay); }
  process(port: HydrationExecutionPort<T>): void { this.work.process(port); }
}
