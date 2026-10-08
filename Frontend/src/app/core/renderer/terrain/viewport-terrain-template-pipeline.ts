/** Owns in-flight terrain template extraction and grouped terrain hydration accounting, not GPU templates. */
export class ViewportTerrainTemplatePipeline<T> {
  private readonly pendingByKey = new Map<string, Promise<T | undefined>>();
  private pendingGroups = 0;

  resolve(key: string, create: () => Promise<T | undefined>): Promise<T | undefined> {
    const existing = this.pendingByKey.get(key);
    if (existing) return existing;
    const pending = create();
    this.pendingByKey.set(key, pending);
    const clear = (): void => { if (this.pendingByKey.get(key) === pending) this.pendingByKey.delete(key); };
    void pending.then(clear, clear);
    return pending;
  }

  clearPending(): void { this.pendingByKey.clear(); }
  get pendingCount(): number { return this.pendingByKey.size; }

  beginGroups(count: number): void { this.pendingGroups += Math.max(0, count); }
  finishGroups(count: number): void { this.pendingGroups = Math.max(0, this.pendingGroups - Math.max(0, count)); }
  resetGroups(): void { this.pendingGroups = 0; }
  get pendingGroupCount(): number { return this.pendingGroups; }
  dispose(): void { this.clearPending(); this.resetGroups(); }
}
