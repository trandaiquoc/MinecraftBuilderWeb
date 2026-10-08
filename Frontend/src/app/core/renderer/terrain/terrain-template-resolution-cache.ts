/** Deduplicates in-flight signature-scoped template extraction without owning GPU templates. */
export class TerrainTemplateResolutionCache<T> {
  private readonly pendingByKey = new Map<string, Promise<T | undefined>>();

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
}
