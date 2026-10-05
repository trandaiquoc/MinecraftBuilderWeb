export type ProviderConvergencePhase = 'idle' | 'converging' | 'ready';

export interface ProviderConvergenceSnapshot {
  readonly generation: number;
  readonly phase: ProviderConvergencePhase;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly total: number;
}
const idle = (generation = 0): ProviderConvergenceSnapshot => ({ generation, phase: 'idle', queued: 0, running: 0, completed: 0, total: 0 });

/** Tracks visual-provider convergence independently from structural hydration. */
export class ProviderConvergenceTracker {
  private state: ProviderConvergenceSnapshot = idle();

  snapshot(): ProviderConvergenceSnapshot { return this.state; }

  begin(generation: number, total: number): void {
    this.state = total > 0
      ? { generation, phase: 'converging', queued: total, running: 0, completed: 0, total }
      : { ...idle(generation), phase: 'ready' };
  }

  queued(count: number): void { this.state = { ...this.state, phase: this.state.total ? 'converging' : this.state.phase, queued: Math.max(0, count) }; }

  started(count = 1): void {
    this.state = { ...this.state, phase: 'converging', queued: Math.max(0, this.state.queued - count), running: this.state.running + count };
  }

  completed(count = 1): void {
    const completed = Math.min(this.state.total, this.state.completed + count);
    const running = Math.max(0, this.state.running - count);
    const queued = Math.max(0, this.state.total - completed - running);
    this.state = { ...this.state, phase: completed >= this.state.total && running === 0 && queued === 0 ? 'ready' : 'converging', completed, running, queued };
  }

  reset(generation = this.state.generation): void { this.state = idle(generation); }
}
