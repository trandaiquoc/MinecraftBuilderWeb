import { HydrationScheduler } from '../scheduling/hydration-scheduler';
import { HydrationWorkCoordinator } from '../scheduling/hydration-work-coordinator';
import type { HydrationWorkCounts, HydrationWorkItem } from '../scheduling/hydration-work-coordinator';
import type { HydrationLane } from '../scheduling/hydration-progress-tracker';

export interface RunningBlockHydrationOwnership {
  readonly generation: number;
  readonly revision: number;
  readonly signature: string;
}

export interface HydrationExecutionPort<T extends HydrationWorkItem> {
  readonly isStopped: () => boolean;
  readonly isInteractive: () => boolean;
  readonly now: () => number;
  readonly budgetMs: (interactive: boolean) => number;
  readonly interactiveJobLimit: () => number;
  readonly jobLimit: () => number;
  readonly ownership: (job: T) => { readonly revision: number; readonly signature: string };
  readonly execute: (job: T, complete: () => void) => void;
  readonly onBatchStart: () => void;
  readonly onJobStarted: (job: T, fairnessDeferrals: number) => void;
  readonly onExecutionFailure: (job: T, error: unknown) => void;
  readonly onJobComplete: (job: T, authoritative: boolean) => void;
  readonly processAdditionalWork: (generation: number, deadline: number) => void;
  readonly hasAdditionalWork: () => boolean;
  readonly onBatchDuration?: (durationMs: number) => void;
}

/** Owns block queue ordering, generation cancellation, scheduler and running ownership. */
export class BlockHydrationWorkOwner<T extends HydrationWorkItem> {
  private readonly work: HydrationWorkCoordinator<T>;
  private readonly scheduler = new HydrationScheduler<never>();
  private currentGeneration = 0;
  private readonly pending = new Map<string, string>();
  private readonly running = new Map<string, RunningBlockHydrationOwnership>();
  private readonly runningByGeneration = new Map<number, number>();
  private batchJobBudget = 0;
  private batchDeadline = 0;
  private currentLane: HydrationLane = 'structural';

  constructor(options: { readonly concurrency: number; readonly regularReservedCapacity: number; readonly providerRefreshCapacity: number }) {
    this.work = new HydrationWorkCoordinator<T>(options);
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
  runningGenerationSnapshot(): ReadonlyMap<number, number> { return new Map(this.runningByGeneration); }
  runningKeyGenerationsSnapshot(): ReadonlyMap<string, number> { return new Map([...this.running].map(([key, owner]) => [key, owner.generation])); }
  workCounts(): HydrationWorkCounts { return this.work.counts(); }
  regularJobs(): readonly T[] { return this.work.regularJobs(); }
  prioritizeRegularJobs(roleOf: (job: T) => 'normal' | 'reference' | 'missing'): void {
    const normal: T[] = [], reference: T[] = [], missing: T[] = [];
    for (const job of this.work.regularJobs()) {
      if (roleOf(job) === 'normal') normal.push(job);
      else if (roleOf(job) === 'reference') reference.push(job);
      else missing.push(job);
    }
    this.work.replaceRegular([...normal, ...reference, ...missing]);
  }
  providerRefreshJobs(): readonly T[] { return this.work.providerRefreshJobs(); }
  takeNextJob(generation: number): T | undefined { return this.work.takeNext(generation); }
  completeJob(job: T): void { this.work.complete(job); }
  fairnessDeferrals(): number { return this.work.fairnessDeferrals(); }
  canStartWork(): boolean { return this.work.canStart(); }
  enqueueRegular(job: T): void { this.work.enqueueRegular(job); }
  enqueueProviderRefresh(job: T): boolean { return this.work.enqueueProviderRefresh(job); }
  replaceRegular(jobs: readonly T[]): void { this.work.replaceRegular(jobs); }
  retainPending(predicate: (job: T) => boolean): void { this.work.retainPending(predicate); }
  removePendingKeys(keys: ReadonlySet<string>): void { this.work.removePendingKeys(keys); }
  clearPendingWork(): void { this.work.clearPending(); }
  clearPendingProviderRefreshWork(): void { this.work.clearPendingProviderRefresh(); }
  compactWork(): void { this.work.compact(); }
  compactConsumedWork(): void { this.work.compactConsumed(); }
  queuedWork(): number { return this.work.queuedTotal(); }
  queuedProviderRefreshWork(): number { return this.work.queuedProviderRefresh(); }
  isScheduled(): boolean { return this.scheduler.isScheduled; }
  isTimerActive(): boolean { return this.scheduler.timerActive; }
  cancelScheduledWork(): void { this.scheduler.cancel(); }
  startWork(generation: number): void { this.runningByGeneration.set(generation, this.runningGenerationCount(generation) + 1); }
  startJob(key: string, generation: number, revision: number, signature: string): void { this.running.set(key, { generation, revision, signature }); }
  ownsJob(key: string, generation: number, revision: number, signature: string): boolean {
    const owner = this.running.get(key);
    return owner?.generation === generation && owner.revision === revision && owner.signature === signature;
  }
  finishWork(generation: number): void {
    const count = Math.max(0, this.runningGenerationCount(generation) - 1);
    if (count) this.runningByGeneration.set(generation, count); else this.runningByGeneration.delete(generation);
  }
  finishJobOwnership(key: string): void { this.running.delete(key); }
  clearRunningOwnership(): void { this.running.clear(); this.runningByGeneration.clear(); }
  setBatchBudget(jobCount: number, deadline: number): void { this.batchJobBudget = jobCount; this.batchDeadline = deadline; }
  consumeBatchJob(): void { this.batchJobBudget = Math.max(0, this.batchJobBudget - 1); }
  clearBatchBudget(): void { this.setBatchBudget(0, 0); }

  schedule(run: () => void, delay: boolean | number = false): void {
    if (this.scheduler.isScheduled) return;
    this.scheduler.schedule(run, !delay ? undefined : typeof delay === 'number' ? delay : 0);
  }

  process(port: HydrationExecutionPort<T>): void {
    if (port.isStopped()) return;
    const traceStarted = port.onBatchDuration ? port.now() : undefined;
    const token = this.generation;
    const interactive = port.isInteractive();
    const now = port.now();
    if (this.batchDeadlineAt <= now || this.batchBudget <= 0) this.setBatchBudget(interactive ? port.interactiveJobLimit() : VIEWPORT_HYDRATION_BATCH_SIZE, now + port.budgetMs(interactive));
    const deadline = this.batchDeadlineAt;
    const maxJobs = interactive ? port.interactiveJobLimit() : port.jobLimit();
    let started = 0;
    port.onBatchStart();
    while (this.canStartWork() && this.queuedWork() && started < maxJobs && port.now() < deadline) {
      const before = this.fairnessDeferrals();
      const job = this.takeNextJob(token);
      if (!job) break;
      const deferred = this.fairnessDeferrals() - before;
      if (!job.providerRefresh) {
        this.clearPendingSignature(job.key);
        const ownership = port.ownership(job);
        this.startJob(job.key, job.token, ownership.revision, ownership.signature);
      }
      this.consumeBatchJob();
      this.startWork(job.token);
      started += 1;
      port.onJobStarted(job, deferred);
      const complete = (): void => {
        const ownership = port.ownership(job);
        const authoritative = !job.providerRefresh && this.ownsJob(job.key, job.token, ownership.revision, ownership.signature);
        if (authoritative) this.finishJobOwnership(job.key);
        this.completeJob(job);
        port.onJobComplete(job, authoritative);
        this.finishWork(job.token);
        this.scheduleNext(port);
      };
      try { port.execute(job, complete); } catch (error: unknown) { port.onExecutionFailure(job, error); complete(); }
    }
    port.processAdditionalWork(token, deadline);
    const workRemaining = this.queuedWork() > 0 || port.hasAdditionalWork();
    if (workRemaining && this.runningTotal === 0) {
      const budgetExhausted = this.batchBudget <= 0 || port.now() >= this.batchDeadlineAt;
      if (budgetExhausted) { this.clearBatchBudget(); this.schedule(() => this.process(port), true); } else this.schedule(() => this.process(port));
    } else if (!workRemaining && this.runningTotal === 0) this.clearBatchBudget();
    this.work.compactConsumed();
    if (traceStarted !== undefined) port.onBatchDuration?.(port.now() - traceStarted);
  }

  private scheduleNext(port: HydrationExecutionPort<T>): void {
    if (port.isStopped()) return;
    this.schedule(() => this.process(port), this.batchBudget > 0 && port.now() < this.batchDeadlineAt ? false : true);
  }
}

const VIEWPORT_HYDRATION_BATCH_SIZE = 96;
